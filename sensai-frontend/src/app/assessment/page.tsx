"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Loader2, Plus, Trash2, CheckCircle, XCircle, LayoutDashboard, Layers, 
  PieChart, BookOpen, BrainCircuit, FileText, ChevronRight, Upload, 
  RefreshCw, Save, Download, AlertTriangle, Edit3, Sparkles, Eye, ExternalLink,
  MessageSquare, Send, AlertCircle, Building, Target, ArrowUpRight, ArrowRight,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/header";

// --- Types ---
interface GeneratedQuestion {
  id: string;
  type: string;
  module: string;
  skills_tested: string[];
  cognitive_level: string;
  difficulty: "Easy" | "Medium" | "Hard";
  question_text: string;
  options?: string[];
  answer: string;
  explanation: string;
}

interface SkillCoverage {
  skill_name: string;
  coverage_percentage: number;
}

function calculateInitialWeightages(items: { name: string, importance: "HIGH" | "MEDIUM" | "LOW" }[]): Record<string, number> {
  if (items.length === 0) return {};
  
  const scores = items.map(it => {
    if (it.importance === "HIGH") return 10;
    if (it.importance === "MEDIUM") return 3;
    return 1;
  });
  
  const totalScore = scores.reduce((a, b) => a + b, 0);
  const initialMap: Record<string, number> = {};
  
  items.forEach((it, i) => {
    initialMap[it.name] = Math.round((scores[i] / totalScore) * 100);
  });
  
  // Balance to 100
  const currentTotal = Object.values(initialMap).reduce((a, b) => a + b, 0);
  if (currentTotal !== 100 && items.length > 0) {
    // Add/subtract difference to the highest importance item
    const sorted = [...items].sort((a, b) => {
      const sA = a.importance === "HIGH" ? 3 : (a.importance === "MEDIUM" ? 2 : 1);
      const sB = b.importance === "HIGH" ? 3 : (b.importance === "MEDIUM" ? 2 : 1);
      return sB - sA;
    });
    initialMap[sorted[0].name] += (100 - currentTotal);
  }
  
  return initialMap;
}

function normalizeWithGovernance(
  map: Record<string, number>, 
  keyChanged: string, 
  newVal: number,
  baselines: Record<string, number>,
  items: { name: string, importance: "HIGH" | "MEDIUM" | "LOW" }[]
): { newMap: Record<string, number>, warning?: string } {
  const newMap = { ...map };
  const itemChanged = items.find(it => it.name === keyChanged);
  const isHighPriority = itemChanged?.importance === "HIGH";
  
  let warning: string | undefined;

  // Rule 2: High Priority Protection (70% threshold)
  if (isHighPriority) {
    const baseline = baselines[keyChanged] || 0;
    const threshold = baseline * 0.7;
    if (newVal < threshold) {
      newMap[keyChanged] = Math.round(threshold);
      return { newMap, warning: "High-priority skill weightage cannot be reduced beyond acceptable limit." };
    } else if (newVal < baseline) {
      warning = "You are reducing weightage of a high-priority skill. This may impact assessment quality.";
    }
  }

  const delta = newVal - map[keyChanged];
  newMap[keyChanged] = newVal;

  // Rule 3: Redistribution Logic
  const otherItems = items.filter(it => it.name !== keyChanged);
  if (otherItems.length === 0) {
    newMap[keyChanged] = 100;
    return { newMap };
  }

  if (delta > 0) {
    // I increased a slider, need to REDUCE others
    // Priority order of reduction: LOW -> MEDIUM -> HIGH
    let amountToReduce = delta;
    const tiers: ("LOW" | "MEDIUM" | "HIGH")[] = ["LOW", "MEDIUM", "HIGH"];
    
    for (const tier of tiers) {
      if (amountToReduce <= 0) break;
      const tierItems = otherItems.filter(it => it.importance === tier);
      const currentTierSum = tierItems.reduce((acc, it) => acc + (newMap[it.name] || 0), 0);
      
      if (currentTierSum > 0) {
        const reductionFromThisTier = Math.min(amountToReduce, currentTierSum);
        tierItems.forEach(it => {
          const share = (newMap[it.name] / currentTierSum) * reductionFromThisTier;
          newMap[it.name] = Math.max(0, newMap[it.name] - Math.round(share));
        });
        amountToReduce -= reductionFromThisTier;
      }
    }
  } else {
    // I decreased a slider, need to INCREASE others proportionally
    let amountToDistribute = Math.abs(delta);
    const otherItemsSelected = otherItems.filter(it => map[it.name] !== undefined);
    const otherSum = otherItemsSelected.reduce((acc, it) => acc + map[it.name], 0);
    
    if (otherSum === 0) {
      const perItem = amountToDistribute / otherItemsSelected.length;
      otherItemsSelected.forEach(it => newMap[it.name] = Math.round(perItem));
    } else {
      otherItemsSelected.forEach(it => {
        newMap[it.name] += Math.round((map[it.name] / otherSum) * amountToDistribute);
      });
    }
  }

  // Final Balance to 100
  const finalSum = Object.values(newMap).reduce((a, b) => a + b, 0);
  if (finalSum !== 100 && otherItems.length > 0) {
    // Find a non-zero item to adjust
    const adjustKey = otherItems.find(it => newMap[it.name] > 0)?.name || otherItems[0].name;
    newMap[adjustKey] += (100 - finalSum);
  }

  return { newMap, warning };
}

function AssessmentContent() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "recruiter" ? "recruiter" : "educator";
  const [mode, setMode] = useState<"educator" | "recruiter">(initialMode);
  const [roleLocked, setRoleLocked] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Phase 1
  const [curriculumText, setCurriculumText] = useState("");
  const [lastParsedText, setLastParsedText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [availableCourses, setAvailableCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<any>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const handleStartOver = () => {
    showConfirm(
      "Reset Assessment?", 
      "This will PERMANENTLY delete your current progress and start a fresh assessment from scratch. This action cannot be undone.",
      async () => {
        try {
          await fetch(`http://localhost:8001/assessments_v3/draft/${USER_ID}`, { method: "DELETE" });
          window.location.reload();
        } catch (e) { window.location.reload(); }
      }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsExtracting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://localhost:8001/assessments_v3/extract-text", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Extraction failed");
      const data = await res.json();
      setCurriculumText(data.text);
    } catch (e) {
      console.error(e);
      showAlert("Extraction Failed", "We couldn't read the file content. Please check the file format.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleParseCurriculum = async () => {
    if (!curriculumText.trim()) return;
    
    // PERSISTENCE: If text hasn't changed, just move forward
    if (curriculumText === lastParsedText && modules.length > 0) {
      setRoleLocked(true);
      setCurrentStep(2);
      return;
    }
    
    setIsParsing(true);
    try {
      const endpoint = mode === "recruiter" ? "parse-jd" : "parse-curriculum";
      const body = mode === "recruiter" ? { jd_text: curriculumText } : { curriculum_text: curriculumText };
      
      const res = await fetch(`http://localhost:8001/assessments_v3/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const modArr = data.modules.map((m: any) => ({ name: m.name, selected: true, suggested: false, importance: m.importance || "MEDIUM" }));
      const sugArr = data.suggested_modules.map((m: any) => ({ name: m.name, selected: false, suggested: true, reason: m.reason, importance: m.importance || "MEDIUM" }));
      setModules([...modArr, ...sugArr]);
      
      const skArr = data.skills.map((s: any) => ({ name: s.name, selected: true, type: s.type, importance: s.importance || "MEDIUM" }));
      setSkills(skArr);
      
      // Auto-detect Seniority/Difficulty for recruiters
      if (mode === "recruiter" && data.detected_seniority) {
        const sen = data.detected_seniority.toLowerCase();
        if (sen.includes("senior")) setDifficulty("Hard");
        else if (sen.includes("mid")) setDifficulty("Medium");
        else if (sen.includes("entry") || sen.includes("junior")) setDifficulty("Easy");
      }
      setLastParsedText(curriculumText);
      setRoleLocked(true);
      setCurrentStep(2);
    } catch (e) {
      showAlert("Parse Error", "Sensai failed to analyze the content. Ensure your input is clear and descriptive.");
    } finally {
      setIsParsing(false);
    }
  };

  // Phase 2
  const [modules, setModules] = useState<{name: string, selected: boolean, suggested: boolean, importance: "HIGH" | "MEDIUM" | "LOW", reason?: string}[]>([]);
  const [skills, setSkills] = useState<{name: string, selected: boolean, type: string, importance: "HIGH" | "MEDIUM" | "LOW"}[]>([]);
  const [newModuleName, setNewModuleName] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [isValidatingAddition, setIsValidatingAddition] = useState(false);

  const validateAddition = async (item: string, type: "module" | "skill") => {
    setIsValidatingAddition(true);
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/validate-addition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum_text: curriculumText, item, item_type: type })
      });
      const data = await res.json();
      if (!data.valid) {
         alert(`Cannot add: ${data.reason}`);
         return null;
      }
      return data.corrected || item;
    } catch (e) { return item; } finally { setIsValidatingAddition(false); }
  };

  const addModule = async () => {
    if (!newModuleName.trim() || isValidatingAddition) return;
    const validatedName = await validateAddition(newModuleName, "module");
    if (validatedName) {
      setModules([...modules, { name: validatedName, selected: true, suggested: false, importance: "MEDIUM" }]);
      setNewModuleName("");
    }
  };

  const addSkill = async () => {
    if (!newSkillName.trim() || isValidatingAddition) return;
    const validatedName = await validateAddition(newSkillName, "skill");
    if (validatedName) {
      setSkills([...skills, { name: validatedName, selected: true, type: "core", importance: "MEDIUM" }]);
      setNewSkillName("");
    }
  };

  // Phase 3
  const [weightageBaseline, setWeightageBaseline] = useState<Record<string, number>>({});
  const [questionTypes, setQuestionTypes] = useState({ MCQ: 15, SAQ: 5, Coding: 0, CaseBased: 1 });
  const [moduleCoverage, setModuleCoverage] = useState<Record<string, number>>({});
  const [skillMapping, setSkillMapping] = useState<Record<string, number>>({
    "Theory": 50,
    "Problem Solving": 30,
    "Application": 20
  });
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [includeAptitude, setIncludeAptitude] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [coverageReport, setCoverageReport] = useState<SkillCoverage[]>([]);

  // Calculate and fix weights when entering Step 3
  useEffect(() => {
    if (currentStep !== 3) return;
    
    const selectedMods = modules.filter(m => m.selected);
    if (selectedMods.length === 0) return;

    // Check if the set of selected modules has changed from what we have in moduleCoverage
    const currentKeys = Object.keys(moduleCoverage).sort();
    const targetKeys = selectedMods.map(m => m.name).sort();
    const keysChanged = JSON.stringify(currentKeys) !== JSON.stringify(targetKeys);

    if (keysChanged || Object.keys(moduleCoverage).length === 0) {
      const initialMap = calculateInitialWeightages(selectedMods);
      setModuleCoverage(initialMap);
      setWeightageBaseline(initialMap); // Baseline is the AI default
    }
  }, [modules, currentStep]);

  const handleModuleCoverageChange = (name: string, val: number) => {
    const { newMap, warning } = normalizeWithGovernance(moduleCoverage, name, val, weightageBaseline, modules);
    setModuleCoverage(newMap);
    if (warning) showAlert("Weightage Guardrail", warning, warning.includes("cannot") ? "error" : "warning");
  };
  
  const handleSkillMappingChange = (name: string, val: number) => {
    setSkillMapping(prev => normalizePercentages(prev, name, val));
  };

  const handleGenerateQuestions = async () => {
    setIsGenerating(true);
    try {
      const selectedMods = modules.filter(m => m.selected).map(m => m.name);
      const selectedSks = skills.filter(s => s.selected).map(s => s.name);
      
      const res = await fetch("http://localhost:8001/assessments_v3/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modules: selectedMods,
          skills: selectedSks,
          question_types: questionTypes,
          module_coverage: moduleCoverage,
          skill_mapping: skillMapping,
          generation_mode: mode === "educator" ? "curriculum" : "jd",
          difficulty: difficulty,
          include_aptitude: includeAptitude,
          context_text: curriculumText
        }),
      });
      const data = await res.json();
      setQuestions(data.questions.map((q: any) => ({ ...q, status: "pending" })));
      setCoverageReport(data.coverage_report || []);
      setCurrentStep(4);
    } catch (e) {
      showAlert("Generation Failed", "We encountered an issue creating your questions. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Phase 4
  const [questions, setQuestions] = useState<(GeneratedQuestion & {status: "pending"|"accepted"|"rejected"|"edited", isRegenerating?: boolean})[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    type: "full" | "segment";
    qId: string;
    segment?: string;
    feedback: string;
  }>({ isOpen: false, type: "full", qId: "", feedback: "" });
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "error" | "warning";
    onConfirm?: () => void;
  }>({ isOpen: false, title: "", message: "", type: "info" });

  const showAlert = (title: string, message: string, type: "info" | "error" | "warning" = "error") => {
    setDialog({ isOpen: true, title, message, type });
  };
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setDialog({ isOpen: true, title, message, type: "warning", onConfirm });
  };

  // Persistence via Backend
  const [isMounted, setIsMounted] = useState(false);
  const USER_ID = 1;

  useEffect(() => {
    setIsMounted(true);
    const fetchDraft = async () => {
      try {
        const res = await fetch(`http://localhost:8001/assessments_v3/draft/${USER_ID}`);
        if (res.ok) {
          const data = await res.json();
          if (data.current_step) setCurrentStep(data.current_step);
          if (data.curriculum_text) setCurriculumText(data.curriculum_text);
          if (data.modules) setModules(data.modules);
          if (data.skills) setSkills(data.skills);
          if (data.questions) setQuestions(data.questions);
          if (data.config) {
            if (data.config.questionTypes) setQuestionTypes(data.config.questionTypes);
            if (data.config.moduleCoverage) setModuleCoverage(data.config.moduleCoverage);
            if (data.config.skillMapping) setSkillMapping(data.config.skillMapping);
            if (data.config.difficulty) setDifficulty(data.config.difficulty);
            if (data.config.includeAptitude) setIncludeAptitude(data.config.includeAptitude);
          }
          if (data.coverage_report) setCoverageReport(data.coverage_report);
        }
      } catch (e) { console.error("Persistence fetch error", e); }
    };
    fetchDraft();
  }, []);

  const saveDraft = async () => {
    try {
      await fetch("http://localhost:8001/assessments_v3/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: USER_ID,
          data: {
            curriculum_text: curriculumText,
            modules,
            skills,
            questions,
            current_step: currentStep,
            coverage_report: coverageReport,
            config: {
              questionTypes,
              moduleCoverage,
              skillMapping,
              difficulty,
              includeAptitude
            }
          }
        }),
      });
    } catch (e) { console.error("Save draft error", e); }
  };

  const handleUpdateQuestion = (id: string, updates: Partial<GeneratedQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates, status: "edited" } : q));
  };

  const handleAddOption = (qId: string) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        return { ...q, options: [...q.options, "New Option"], status: "edited" };
      }
      return q;
    }));
  };

  const handleDeleteOption = (qId: string, optIdx: number) => {
    setQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        const newOpts = q.options.filter((_, i) => i !== optIdx);
        // If we deleted the correct answer, reset it
        const newAns = q.answer === q.options[optIdx] ? newOpts[0] || "" : q.answer;
        return { ...q, options: newOpts, answer: newAns, status: "edited" };
      }
      return q;
    }));
  };

  // PERSISTENCE: consolidated auto-save effect
  useEffect(() => {
    if (!isMounted || currentStep === 1) return;
    const timer = setTimeout(() => {
      saveDraft();
    }, 1500);
    return () => clearTimeout(timer);
  }, [currentStep, curriculumText, modules, skills, questionTypes, moduleCoverage, skillMapping, questions, coverageReport]);

  const handleRegenerate = (id: string) => {
    setFeedbackModal({ isOpen: true, type: "full", qId: id, feedback: "" });
  };

  const handleRegenerateSegment = (id: string, segment: string) => {
    setFeedbackModal({ isOpen: true, type: "segment", qId: id, segment, feedback: "" });
  };

  const executeRegeneration = async () => {
    const { type, qId, feedback, segment } = feedbackModal;
    setFeedbackModal(prev => ({ ...prev, isOpen: false }));
    
    const qIndex = questions.findIndex(q => q.id === qId);
    if (qIndex === -1) return;

    const newQs = [...questions];
    newQs[qIndex].isRegenerating = true;
    setQuestions(newQs);

    try {
      if (type === "full") {
        const res = await fetch("http://localhost:8001/assessments_v3/regenerate-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: questions[qIndex], feedback })
        });
        const data = await res.json();
        const updatedQs = [...questions];
        updatedQs[qIndex] = { ...data.question, status: "edited", isRegenerating: false };
        setQuestions(updatedQs);
      } else {
        const res = await fetch("http://localhost:8001/assessments_v3/regenerate-segment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ original_text: segment, feedback, context: questions[qIndex].question_text })
        });
        const data = await res.json();
        const updatedQs = [...questions];
        updatedQs[qIndex].question_text = updatedQs[qIndex].question_text.replace(segment || "", data.updated_text);
        updatedQs[qIndex].isRegenerating = false;
        updatedQs[qIndex] = { ...data.question, status: "edited", isRegenerating: false };
        setQuestions(updatedQs);
      }
    } catch(e) {
      showAlert("Regeneration Error", "Could not refresh this question. The model might be busy.");
      const resetQs = [...questions];
      resetQs[qIndex].isRegenerating = false;
      setQuestions(resetQs);
    }
  };

  const handleExportPDF = async () => {
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Assessment",
          questions: questions.filter(q => q.status !== "rejected")
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: "Unknown server error" }));
        throw new Error(errorData.detail || "Failed to generate PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "assessment.pdf";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) { 
      showAlert("Download Failed", e.message || "There was an error generating your PDF. Please try again."); 
    }
  };

  const openPublishModal = async () => {
    setIsPublishModalOpen(true);
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/available-courses");
      const data = await res.json();
      setAvailableCourses(data);
    } catch (e) {
      showAlert("Course Fetch Failed", "Could not load your existing courses.");
    }
  };

  const resetAllState = async () => {
    // Delete the backend draft
    try { await fetch(`http://localhost:8001/assessments_v3/draft/${USER_ID}`, { method: "DELETE" }); } catch {}
    // Reset all local state
    setCurriculumText("");
    setLastParsedText("");
    setModules([]);
    setSkills([]);
    setQuestions([]);
    setCoverageReport([]);
    setModuleCoverage({});
    setQuestionTypes({ MCQ: 15, SAQ: 5, Coding: 0, CaseBased: 1 });
    setSkillMapping({ "Theory": 50, "Problem Solving": 30, "Application": 20 });
    setDifficulty("Medium");
    setIncludeAptitude(false);
    setCurrentStep(1);
  };

  const handlePublish = async (publishType: "standalone" | "course" = "course") => {
    setIsPublishing(true);
    const acceptedQs = questions.filter(q => q.status === "accepted");
    if (acceptedQs.length === 0) {
      showAlert("No Questions Selected", "Please accept at least one question before publishing.");
      setIsPublishing(false);
      return;
    }
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Intelligence Assessment - " + (mode === "recruiter" ? "Recruitment" : "Learning"),
          config: { modules, skills, mode },
          questions: acceptedQs,
          publish_type: publishType,
          course_id: publishType === "course" ? selectedCourse?.id : undefined,
          milestone_id: publishType === "course" ? selectedMilestone?.id : undefined
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Publish failed" }));
        throw new Error(err.detail || "Publish failed");
      }
      
      setPublishSuccess(true);
      // Clear everything immediately so user can start fresh
      await resetAllState();
      setTimeout(() => {
        window.location.href = "/my-assessments";
      }, 1800);
    } catch (e: any) {
      showAlert("Publish Error", e.message || "We couldn't finalize your assessment right now.");
      setIsPublishing(false);
    }
  };


  const totalQuestionsNeeded = Object.values(questionTypes).reduce((a,b)=>a+b, 0);
  const selectedModulesCount = modules.filter(m=>m.selected).length;
  
  const blueprintValid = totalQuestionsNeeded >= 5 && totalQuestionsNeeded >= selectedModulesCount && Object.keys(moduleCoverage).length > 0;
  const showBlueprintWarning = totalQuestionsNeeded > selectedModulesCount * 5;
  const showBlueprintError = totalQuestionsNeeded > 0 && (totalQuestionsNeeded < 5 || totalQuestionsNeeded < selectedModulesCount);

  if (!isMounted) return <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#1A1A1A]"><Loader2 className="w-8 h-8 animate-spin text-foreground" /></div>;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1A1A1A] text-black dark:text-white pb-20 font-sans selection:bg-blue-500/30 tracking-tight">
      <Header />
      
      <div className="max-w-6xl mx-auto space-y-10 px-8 pt-8">
        
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6"
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              Create Assessment
              {/* <span className="text-sm font-medium px-2 py-1 bg-gray-100 dark:bg-white/10 rounded-lg text-muted-foreground uppercase tracking-widest leading-none">Smart Mode</span> */}
            </h1>
            <p className="text-muted-foreground mt-2 font-medium">
              {mode === "educator" ? "Build professional tests and quizzes effortlessly." : "Create role-aligned screening tests for your candidates."}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-2">
            {!roleLocked ? (
              <div className="flex bg-gray-100 dark:bg-[#222222] rounded-xl p-1 shadow-sm border border-gray-200 dark:border-transparent">
                <button 
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === "educator" ? "bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm" : "text-muted-foreground hover:text-black dark:hover:text-white"}`}
                  onClick={() => { setMode("educator"); setCurrentStep(1); }}
                >
                  Trainer
                </button>
                <button 
                  className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === "recruiter" ? "bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm" : "text-muted-foreground hover:text-black dark:hover:text-white"}`}
                  onClick={() => setMode("recruiter")} 
                >
                  Recruiter
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-6 py-2 bg-primary/10 border border-primary/20 rounded-full shadow-sm animate-in fade-in zoom-in duration-300">
                <div className={`w-2 h-2 rounded-full animate-pulse ${mode === "recruiter" ? "bg-blue-500" : "bg-emerald-500"}`} />
                <span className="text-sm font-black uppercase tracking-widest text-primary">
                  {mode === "recruiter" ? "Recruiter" : "Trainer"} Mode
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Navigation / Progress */}
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto bg-gray-50 dark:bg-[#222222]/30 p-4 rounded-2xl border border-gray-200 dark:border-white/5">
           {[ 
             { id: 1, label: mode === "educator" ? "Add Content" : "Paste JD", icon: FileText },
             { id: 2, label: mode === "educator" ? "Review Topics" : "Capabilities", icon: Layers },
             { id: 3, label: "Question Plan", icon: PieChart },
             { id: 4, label: "Final Review", icon: CheckCircle }
           ].map((st, i) => (
             <React.Fragment key={st.id}>
                <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${currentStep === st.id ? "scale-100" : "opacity-40 grayscale"}`}>
                   <div className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${currentStep === st.id ? "border-primary bg-primary text-primary-foreground shadow-sm" : currentStep > st.id ? "border-emerald-500 bg-emerald-500/10 text-emerald-500" : "border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 text-muted-foreground"}` }>
                     {currentStep > st.id ? <CheckCircle className="w-5 h-5" /> : <st.icon className="w-5 h-5" />}
                   </div>
                   <span className="text-[10px] font-bold uppercase tracking-wider">{st.label}</span>
                </div>
                {i < 3 && <div className={`h-[2px] flex-1 mx-2 ${currentStep > st.id + 1 ? "bg-emerald-500" : "bg-gray-100 dark:bg-white/5"}`} />}
             </React.Fragment>
           ))}
           
           <div className="ml-auto pl-4 border-l border-gray-200 dark:border-white/10">
              <button 
                onClick={handleStartOver}
                className="flex items-center gap-2 px-4 py-2 text-muted-foreground hover:text-red-500 transition-colors text-[10px] font-black uppercase tracking-widest"
              >
                <RotateCcw className="w-4 h-4" /> Start from Scratch
              </button>
           </div>
        </div>

        <AnimatePresence mode="wait">
          {currentStep === 1 && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="bg-white dark:bg-[#1A1A1A] p-8 rounded-3xl shadow-sm border border-gray-200 dark:border-[#333333] relative overflow-hidden"
            >
               <h2 className="text-2xl font-bold mb-2 tracking-tight">
                 {mode === "educator" ? "Step 1: Upload or Paste Content" : "Step 1: Upload or Paste Job Description"}
               </h2>
               <p className="text-muted-foreground text-sm mb-8 font-medium">
                 {mode === "educator" ? "Add your syllabus, notes, or course materials." : "Paste the full JD to extract required skills and role capabilities."}
               </p>
               
               <div className="relative mb-6">
                 <textarea 
                    className="w-full h-80 p-6 border border-gray-200 dark:border-[#333333] bg-white dark:bg-black/40 rounded-2xl outline-none focus:border-black dark:focus:border-white transition-all resize-none font-medium text-lg leading-relaxed shadow-sm"
                    placeholder="Paste your content here or upload files..."
                    value={curriculumText}
                    onChange={e => setCurriculumText(e.target.value)}
                 />
                 <label className={`absolute bottom-6 right-6 cursor-pointer bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/20 text-black dark:text-white px-5 py-3 rounded-xl shadow-sm text-sm font-bold flex items-center gap-2 transition-all active:scale-95 ${isExtracting ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {isExtracting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
                    {isExtracting ? "Reading..." : "Upload File"}
                    <input type="file" accept=".txt,.json,.csv,.md,.pdf,.docx,.doc" className="hidden" onChange={handleFileUpload} disabled={isExtracting} />
                 </label>
               </div>
               
               <div className="flex justify-end">
                 <button 
                   onClick={handleParseCurriculum}
                   disabled={isParsing || !curriculumText}
                   className="bg-black dark:bg-white text-white dark:text-black font-bold py-4 px-12 rounded-full hover:opacity-90 disabled:opacity-30 transition-all flex items-center gap-3 shadow-md active:scale-95"
                 >
                   {isParsing ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                   Generate Plan
                 </button>
               </div>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div 
              key="step2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
              <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333333] rounded-3xl flex flex-col h-[700px] overflow-hidden shadow-sm">
                 <div className="p-8 border-b border-gray-100 dark:border-[#333333] flex items-center justify-between">
                   <div>
                     <h2 className="text-lg font-bold">{mode === "educator" ? "Topics Found" : "Role Capabilities"}</h2>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                       {mode === "educator" ? "Main subjects to test" : "Required areas of expertise"}
                     </p>
                   </div>
                   <span className="bg-black dark:bg-white text-white dark:text-black px-3 py-1 rounded-full text-[10px] font-bold">{modules.filter(m=>m.selected).length} ACTIVE</span>
                 </div>
                 <div className="p-8 overflow-y-auto flex-1 space-y-3 scrollbar-hide">
                    {modules.map((m, i) => (
                      <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                        key={i} className={`p-5 rounded-2xl border transition-all duration-300 group ${m.selected ? 'border-primary bg-primary/5 cursor-default' : 'border-gray-100 dark:border-white/5 bg-transparent opacity-60 hover:opacity-100 hover:border-gray-300'}`}>
                         <div className="flex items-start gap-4">
                           <input 
                               type="checkbox" 
                               checked={m.selected}
                               onChange={() => { const n = [...modules]; n[i].selected = !n[i].selected; setModules(n); }}
                               className="mt-1 w-4 h-4 rounded border-gray-300 dark:border-white/10 cursor-pointer accent-primary"
                           />
                           <div className="flex-1">
                              <h4 className="font-bold text-base flex items-center gap-2">
                                {m.name} 
                                <span className={`text-[8px] uppercase px-2 py-0.5 rounded-full font-bold ${
                                  m.importance === "HIGH" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" :
                                  m.importance === "MEDIUM" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                }`}>
                                  {m.importance}
                                </span>
                                {m.suggested && <span className="text-[9px] uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">Recommended</span>}
                              </h4>
                              {m.reason && <p className="text-xs text-muted-foreground mt-1 font-medium">{m.reason}</p>}
                           </div>
                           <button onClick={() => setModules(modules.filter((_, idx)=>idx!==i))} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"><Trash2 className="w-4 h-4"/></button>
                         </div>
                      </motion.div>
                    ))}
                 </div>
                 <div className="p-6 border-t border-gray-100 dark:border-[#333333] flex gap-3">
                   <input type="text" placeholder={mode === "educator" ? "Add custom topic..." : "Add capability..."} value={newModuleName} onChange={e=>setNewModuleName(e.target.value)} className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-[#333333] rounded-xl px-5 py-3 text-sm outline-none focus:border-black dark:focus:border-white" />
                   <button onClick={addModule} disabled={isValidatingAddition} className="bg-black dark:bg-white text-white dark:text-black rounded-xl px-4 py-3 hover:opacity-80 transition-all active:scale-95"><Plus className="w-5 h-5"/></button>
                 </div>
              </div>

              <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#333333] rounded-3xl flex flex-col h-[700px] overflow-hidden shadow-sm">
                 <div className="p-8 border-b border-gray-100 dark:border-[#333333] flex items-center justify-between">
                   <div>
                     <h2 className="text-lg font-bold">Skills List</h2>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Core abilities</p>
                   </div>
                 </div>
                 <div className="p-8 overflow-y-auto flex-1">
                   <div className="flex flex-wrap gap-2">
                    {skills.map((s, i) => (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}
                        key={i} className={`flex items-center gap-2 px-4 py-2 border rounded-full transition-all group ${s.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-100 dark:border-white/5 opacity-60 hover:opacity-100 hover:border-gray-300'}`}>
                         <input type="checkbox" checked={s.selected} onChange={() => { const n = [...skills]; n[i].selected = !n[i].selected; setSkills(n); }} className="w-3.5 h-3.5 rounded border-white/50 accent-white" />
                         <span className="text-xs font-bold uppercase tracking-tight">{s.name}</span>
                         <span className={`text-[7px] font-black px-1.5 rounded-sm ${
                           s.importance === "HIGH" ? "bg-red-500/20 text-red-600" :
                           s.importance === "MEDIUM" ? "bg-amber-500/20 text-amber-600" :
                           "bg-emerald-500/20 text-emerald-600"
                         }`}>
                           {s.importance[0]}
                         </span>
                         <button onClick={() => setSkills(skills.filter((_, idx)=>idx!==i))} className="opacity-0 group-hover:opacity-100 text-current hover:opacity-100 ml-1"><XCircle className="w-3.5 h-3.5"/></button>
                      </motion.div>
                    ))}
                   </div>
                 </div>
                 <div className="p-6 border-t border-gray-100 dark:border-[#333333] flex gap-3">
                   <input type="text" placeholder="Add custom skill..." value={newSkillName} onChange={e=>setNewSkillName(e.target.value)} className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-[#333333] rounded-xl px-5 py-3 text-sm outline-none focus:border-black dark:focus:border-white" />
                   <button onClick={addSkill} disabled={isValidatingAddition} className="bg-black dark:bg-white text-white dark:text-black rounded-xl px-4 py-3 hover:opacity-80 transition-all active:scale-95"><Plus className="w-5 h-5"/></button>
                 </div>
              </div>

              <div className="lg:col-span-2 flex justify-between items-center py-6 bg-gray-50 dark:bg-white/5 px-10 rounded-2xl border border-gray-200 dark:border-white/5">
                 <button onClick={() => setCurrentStep(1)} className="font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest text-[10px]">Back to Content</button>
                 <button onClick={() => setCurrentStep(3)} className="bg-black dark:bg-white text-white dark:text-black font-bold py-4 px-12 rounded-full shadow-md hover:opacity-90 transition-all flex items-center gap-3 uppercase tracking-tight">
                   Question Settings <ChevronRight className="w-5 h-5"/>
                 </button>
              </div>
            </motion.div>
          )}

          {currentStep === 3 && (
            <motion.div 
              key="step3"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-[#1A1A1A] p-10 rounded-[32px] border border-gray-200 dark:border-[#333333] shadow-sm overflow-hidden"
            >
               <div className="flex items-center justify-between mb-12">
                 <h2 className="text-2xl font-bold flex items-center gap-3 tracking-tight">
                   Question Setup
                 </h2>
                 <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-gray-100 dark:bg-white/5 px-3 py-1 rounded-lg border border-gray-200 dark:border-white/10">
                      Auto-Weighted by AI
                    </span>
                 </div>
               </div>
               
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                 <div className="space-y-8">
                    <h3 className="font-bold text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-6 flex items-center gap-2">Assessment Structure <div className="h-px flex-1 bg-gray-100 dark:bg-white/5"/></h3>
                    
                    <div className="space-y-6">
                       <div className="space-y-3">
                         <span className="text-[10px] font-bold text-muted-foreground uppercase">Question Distribution</span>
                         <div className="space-y-2">
                           {Object.entries({ 
                             MCQ: "Multiple Choice", 
                             SAQ: "Short Answer (Analytical)",
                             Coding: "Coding Problems", 
                             CaseBased: "Scenario Based (Mini-case)" 
                           }).map(([key, label]) => (
                             <div key={key} className="flex justify-between items-center bg-gray-100/50 dark:bg-white/5 p-3 rounded-xl border border-gray-100 dark:border-white/5 group transition-all">
                               <span className="font-bold text-[11px]">{label}</span>
                               <input 
                                 type="number" min="0" 
                                 value={questionTypes[key as keyof typeof questionTypes]} 
                                 onChange={(e)=>setQuestionTypes({...questionTypes, [key]: parseInt(e.target.value) || 0})} 
                                 className="w-14 bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-lg py-1 text-center font-bold text-sm outline-none focus:border-primary" 
                               />
                             </div>
                           ))}
                         </div>
                       </div>

                        <div className="space-y-3 pt-4">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase">{mode === "educator" ? "Difficulty Level" : "Target Role Level"}</span>
                          <div className="flex bg-gray-100 dark:bg-[#222222] p-1 rounded-xl border border-gray-200 dark:border-white/5">
                            {(["Easy", "Medium", "Hard"] as const).map((lvl) => (
                              <button
                                key={lvl}
                                onClick={() => setDifficulty(lvl)}
                                className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${difficulty === lvl ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                              >
                                {lvl}
                              </button>
                            ))}
                          </div>
                        </div>

                       {mode === "recruiter" && (
                         <div className="pt-4">
                            <label className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl cursor-pointer hover:bg-blue-500/20 transition-all">
                               <input type="checkbox" checked={includeAptitude} onChange={e => setIncludeAptitude(e.target.checked)} className="w-4 h-4 accent-blue-500" />
                               <div>
                                 <span className="font-bold text-xs block text-blue-600 dark:text-blue-400">Include Aptitude</span>
                                 <span className="text-[9px] text-blue-500/80 font-medium">Add general logic screening</span>
                               </div>
                            </label>
                         </div>
                       )}
                    </div>
                 </div>

                 <div className="space-y-8">
                    <h3 className="font-bold text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-6 flex items-center gap-2">Topic Weight <div className="h-px flex-1 bg-gray-100 dark:bg-white/5"/></h3>
                    <div className="space-y-8 max-h-[400px] overflow-y-auto pr-4 scrollbar-hide">
                      {modules.filter(m=>m.selected).map((m) => (
                        <div key={m.name} className="group">
                          <div className="flex justify-between items-end mb-2">
                             <span className="text-[11px] font-bold uppercase text-muted-foreground truncate w-2/3">{m.name}</span>
                             <span className="text-xs font-black tabular-nums">{moduleCoverage[m.name] || 0}%</span>
                          </div>
                           <div className="relative h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                             <motion.div 
                               initial={{ width: 0 }} animate={{ width: `${moduleCoverage[m.name] || 0}%` }}
                               className={`h-full rounded-full ${
                                 m.importance === "HIGH" ? "bg-red-500" :
                                 m.importance === "MEDIUM" ? "bg-amber-500" :
                                 "bg-emerald-500"
                               }`} 
                             />
                             <input 
                                type="range" min="0" max="100" step="1"
                                value={moduleCoverage[m.name] || 0}
                                onChange={(e) => handleModuleCoverageChange(m.name, parseInt(e.target.value))}
                                disabled={true}
                                className="absolute inset-0 w-full opacity-0 cursor-not-allowed"
                             />
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>

                 <div className="space-y-8">
                    <h3 className="font-bold text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-6 flex items-center gap-2">Complexity Mix <div className="h-px flex-1 bg-gray-100 dark:bg-white/5"/></h3>
                    <div className="space-y-8">
                      {Object.entries(skillMapping).map(([k, v]) => (
                        <div key={k} className="group">
                          <div className="flex justify-between items-end mb-2">
                             <span className="text-[11px] font-bold uppercase text-muted-foreground">{k}</span>
                             <span className="text-xs font-black tabular-nums">{v}%</span>
                          </div>
                           <div className="relative h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${v}%` }} className="h-full bg-black dark:bg-white" />
                            <input 
                               type="range" min="0" max="100" step="5"
                               value={v}
                               onChange={(e) => handleSkillMappingChange(k, parseInt(e.target.value))}
                               disabled={true}
                               className="absolute inset-0 w-full opacity-0 cursor-not-allowed"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
               </div>

               {showBlueprintWarning && (
                 <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-2xl flex items-start gap-4 backdrop-blur-sm">
                   <AlertTriangle className="w-5 h-5 text-amber-600 mt-1" />
                   <div>
                     <h4 className="font-bold text-amber-800 dark:text-amber-400 text-sm mb-1 uppercase tracking-wider">Warning</h4>
                     <p className="text-amber-700/80 dark:text-amber-500/80 text-xs font-medium leading-relaxed">Asking for {totalQuestionsNeeded} questions for only {selectedModulesCount} topics might be too many. Try reducing the count for better quality.</p>
                   </div>
                 </motion.div>
               )}

               {showBlueprintError && (
                 <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-5 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-2xl flex items-start gap-4 backdrop-blur-sm">
                   <XCircle className="w-5 h-5 text-red-600 mt-1" />
                   <div>
                     <h4 className="font-bold text-red-800 dark:text-red-400 text-sm mb-1 uppercase tracking-wider">Check Settings</h4>
                     <p className="text-red-700/80 dark:text-red-500/80 text-xs font-medium leading-relaxed">
                       {totalQuestionsNeeded < 5 ? "Please add at least 5 questions total." : `You selected ${selectedModulesCount} topics, so you need at least ${selectedModulesCount} questions to cover them all.`}
                     </p>
                   </div>
                 </motion.div>
               )}

               <div className="mt-16 flex justify-between items-center py-6 border-t border-gray-100 dark:border-[#333333]">
                 <button onClick={() => setCurrentStep(2)} className="font-bold text-muted-foreground hover:text-foreground transition-colors text-[10px] uppercase tracking-widest">Back to Topics</button>
                 <button 
                   onClick={handleGenerateQuestions}
                   disabled={isGenerating || !blueprintValid}
                   className="bg-black dark:bg-white text-white dark:text-black font-bold py-4 px-16 rounded-full hover:opacity-90 flex items-center gap-3 disabled:opacity-30 transition-all shadow-md active:scale-95"
                 >
                   {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <Sparkles className="w-5 h-5" />} Start Creating
                 </button>
               </div>
            </motion.div>
          )}

          {currentStep === 4 && (
            <motion.div key="step4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
               <div className="flex flex-col md:flex-row justify-between items-center gap-6 border-b border-gray-200 dark:border-[#333333] pb-10">
                 <div className="max-w-2xl">
                    <h2 className="text-3xl font-bold tracking-tight">Final Review</h2>
                    <p className="text-muted-foreground mt-2 font-medium">Accept the questions that form your assessment. You can edit any field directly.</p>
                 </div>
                 <div className="flex items-center gap-3 flex-shrink-0">
                   <button
                     onClick={() => setQuestions(qs => qs.map(q => ({ ...q, status: "accepted" })))}
                     className="bg-emerald-500 text-white font-black py-2.5 px-6 rounded-full text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all flex items-center gap-2 shadow-md"
                   >
                     <CheckCircle className="w-4 h-4" /> Accept All
                   </button>
                   <div className="bg-white dark:bg-black border border-gray-200 dark:border-white/10 px-6 py-3 rounded-2xl font-black text-xl flex items-baseline gap-2 shadow-sm">
                      <span className="text-black dark:text-white">{questions.filter(q => q.status === "accepted").length}</span>
                      <span className="text-muted-foreground text-xs italic">/ {questions.length} ACCEPTED</span>
                   </div>
                 </div>
               </div>

               {coverageReport.length > 0 && (
                 <div className="bg-gray-50/50 dark:bg-white/[0.02] border border-gray-200 dark:border-[#333333] p-10 rounded-[40px] shadow-sm">
                    <div className="flex items-center gap-3 mb-8">
                       <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                          <BrainCircuit className="w-5 h-5" />
                       </div>
                       <div>
                          <h3 className="text-xl font-bold">Coverage & Validation Report</h3>
                          <p className="text-xs text-muted-foreground font-medium">How the assessment maps back to your {mode === "educator" ? "curriculum" : "JD"}.</p>
                       </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                       {coverageReport.map((item, i) => (
                         <motion.div 
                           initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                           key={i} className="bg-white dark:bg-[#222222] p-6 rounded-3xl border border-gray-200 dark:border-white/5 shadow-sm"
                         >
                            <div className="flex justify-between items-end mb-4">
                               <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest truncate w-2/3">{item.skill_name}</span>
                               <span className="text-lg font-black tabular-nums">{item.coverage_percentage}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                               <motion.div 
                                 initial={{ width: 0 }} animate={{ width: `${item.coverage_percentage}%` }}
                                 className="h-full bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.3)]"
                               />
                            </div>
                         </motion.div>
                       ))}
                    </div>
                 </div>
               )}

               <div className="grid gap-10 lg:grid-cols-2">
                  {questions.map((q, idx) => (
                    <motion.div 
                      layout key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
                      className={`relative bg-white dark:bg-[#1A1A1A] rounded-[32px] shadow-sm border transition-all duration-300 overflow-hidden ${q.status === 'accepted' ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : q.status === 'rejected' ? 'border-gray-200 dark:border-white/5 opacity-40 grayscale' : 'border-gray-200 dark:border-[#333333] hover:border-gray-300'}`}
                    >
                      {q.isRegenerating && <div className="absolute inset-0 bg-white/80 dark:bg-black/80 z-20 flex flex-col items-center justify-center gap-4 backdrop-blur-sm"><Loader2 className="w-10 h-10 animate-spin text-primary"/><p className="font-bold text-[10px] uppercase tracking-widest animate-pulse">Wait...</p></div>}
                      
                      <div className="px-8 py-4 flex justify-between items-center bg-gray-50/50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/5">
                         <div className="flex flex-wrap gap-2">
                           <span className="bg-black dark:bg-white text-white dark:text-black px-3 py-1 text-[9px] font-black rounded-md uppercase tracking-tighter shrink-0">{q.type}</span>
                           <span className={`px-3 py-1 text-[9px] font-black rounded-md uppercase tracking-tighter border shrink-0 ${q.difficulty === 'Hard' ? 'border-red-500/20 text-red-600 dark:text-red-400 bg-red-500/5' : q.difficulty === 'Medium' ? 'border-amber-500/20 text-amber-600 dark:text-amber-400 bg-amber-500/5' : 'border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'}`}>{q.difficulty}</span>
                           <span className="text-muted-foreground px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest truncate max-w-[120px]">{q.module}</span>
                         </div>
                         <div className="flex gap-1.5 bg-gray-100 dark:bg-black/60 rounded-xl p-0.5 border border-gray-200 dark:border-white/5">
                            <button onClick={() => setQuestions(questions.map(x=>x.id===q.id?{...x,status:"accepted"}:x))} className={`p-2 rounded-lg transition-all ${q.status === "accepted" ? "bg-emerald-500 text-white shadow-sm" : "hover:bg-emerald-500/10 text-muted-foreground"}`}><CheckCircle className="w-4 h-4"/></button>
                            <button onClick={() => handleRegenerate(q.id)} className="p-2 rounded-lg transition-all hover:bg-primary/10 text-muted-foreground" title="Redo Question"><RefreshCw className="w-4 h-4"/></button>
                            <button onClick={() => setQuestions(questions.map(x=>x.id===q.id?{...x,status:"rejected"}:x))} className={`p-2 rounded-lg transition-all ${q.status === "rejected" ? "bg-red-500 text-white shadow-sm" : "hover:bg-red-500/10 text-muted-foreground"}`}><XCircle className="w-4 h-4"/></button>
                         </div>
                      </div>

                      <div className="p-10 relative">
                        {editingId === q.id ? (
                          <div className="space-y-6">
                            <div>
                               <label className="text-[10px] font-black uppercase text-primary tracking-widest block mb-2">Question Text</label>
                               <textarea 
                                 value={q.question_text} 
                                 onChange={(e) => handleUpdateQuestion(q.id, { question_text: e.target.value })}
                                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-sm font-bold resize-none h-32 outline-none focus:border-primary"
                               />
                            </div>

                            {q.options && (
                              <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-primary tracking-widest block">Options & Correct Answer</label>
                                <div className="space-y-2">
                                  {q.options.map((opt, oidx) => (
                                    <div key={oidx} className="flex items-center gap-3">
                                      <input 
                                        type="radio" name={`correct-${q.id}`} 
                                        checked={q.answer === opt}
                                        onChange={() => handleUpdateQuestion(q.id, { answer: opt })}
                                        className="w-4 h-4 accent-primary cursor-pointer"
                                      />
                                      <input 
                                        type="text" value={opt} 
                                        onChange={(e) => {
                                          const newOpts = [...(q.options || [])];
                                          const oldVal = newOpts[oidx];
                                          newOpts[oidx] = e.target.value;
                                          const newAns = q.answer === oldVal ? e.target.value : q.answer;
                                          handleUpdateQuestion(q.id, { options: newOpts, answer: newAns });
                                        }}
                                        className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:ring-1 focus:ring-primary/50"
                                      />
                                      <button 
                                        onClick={() => handleDeleteOption(q.id, oidx)}
                                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                  <button 
                                    onClick={() => handleAddOption(q.id)}
                                    className="w-full py-2 border border-dashed border-gray-300 dark:border-white/10 rounded-xl text-[10px] font-black text-muted-foreground hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2"
                                  >
                                    <Plus className="w-3 h-3" /> Add Option
                                  </button>
                                </div>
                              </div>
                            )}

                            <div>
                               <label className="text-[10px] font-black uppercase text-primary tracking-widest block mb-2">Explanation</label>
                               <textarea 
                                 value={q.explanation} 
                                 onChange={(e) => handleUpdateQuestion(q.id, { explanation: e.target.value })}
                                 className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-xs font-medium italic resize-none h-24 outline-none focus:border-primary"
                               />
                            </div>
                            
                            <button 
                              onClick={() => setEditingId(null)}
                              className="w-full bg-primary text-primary-foreground font-black py-3 rounded-xl shadow-lg shadow-primary/20 text-[10px] uppercase tracking-[0.2em] transform active:scale-95 transition-all"
                            >
                              Finish Editing
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="group relative">
                              <p className="font-bold text-lg leading-relaxed mb-8 pr-10 selection:bg-primary/20">{q.question_text}</p>
                              <button 
                                onClick={() => setEditingId(q.id)}
                                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-3 transition-all hover:scale-110"
                              >
                                <div className="bg-primary text-primary-foreground p-2 rounded-xl shadow-lg"><Edit3 className="w-4 h-4" /></div>
                              </button>
                            </div>
                            
                            {q.options && q.options.length > 0 && (
                              <div className="space-y-3 mb-8">
                                {q.options.map((opt, oidx) => (
                                  <div key={oidx} className={`px-5 py-3 rounded-2xl text-xs border font-bold transition-all ${opt === q.answer ? 'bg-primary/5 border-primary text-foreground' : 'bg-transparent border-gray-100 dark:border-white/5 hover:border-gray-200'}`}>
                                    <div className="flex items-center gap-4">
                                      <div className={`w-7 h-7 flex items-center justify-center rounded-lg font-black text-[10px] border ${opt === q.answer ? 'bg-primary text-primary-foreground border-primary' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-muted-foreground'}`}>{String.fromCharCode(65 + oidx)}</div>
                                      <span className="flex-1">{opt}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {(!q.options || q.options.length === 0) && (
                              <div className="space-y-2 mb-8">
                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block opacity-80 underline underline-offset-4">Model Answer / Rubric</span>
                                <div className="p-5 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl text-xs font-bold text-muted-foreground italic leading-relaxed">
                                  {q.answer}
                                </div>
                              </div>
                            )}

                            <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2 opacity-80 underline underline-offset-4">Why this answer?</span>
                              <p className="text-[11px] text-foreground/70 font-medium leading-relaxed italic">{q.explanation}</p>
                            </div>
                          </>
                        )}

                        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-white/5 flex gap-2 flex-wrap">
                           {q.skills_tested.map(sk => <span key={sk} className="text-[9px] font-bold text-muted-foreground border border-gray-200 dark:border-white/10 rounded-full px-3 py-1 uppercase tracking-tighter">{sk}</span>)}
                           <span className="text-[9px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 uppercase tracking-widest">{q.cognitive_level}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
               </div>

                <div className="flex flex-col items-center gap-6 py-10 border-t border-gray-100 dark:border-[#333333]">
                   <div className="flex gap-4">
                      <motion.button 
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={handleExportPDF}
                        className="bg-black dark:bg-white text-white dark:text-black font-black py-4 px-10 rounded-full hover:opacity-90 transition-all flex items-center gap-3 shadow-xl text-sm group"
                      >
                        <Download className="w-5 h-5" /> Download PDF
                      </motion.button>
                      
                      <motion.button 
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onClick={() => window.open("/assessment/preview", "_blank")}
                        className="bg-primary text-primary-foreground font-black py-4 px-10 rounded-full hover:opacity-90 transition-all flex items-center gap-3 shadow-xl text-sm group"
                      >
                        <Eye className="w-5 h-5" /> Student Preview
                        <ExternalLink className="w-3 h-3 opacity-50" />
                      </motion.button>
                   </div>

                   {questions.filter(q => q.status === "accepted").length === 0 && (
                     <p className="text-xs text-amber-500 font-bold">⚠ Accept at least one question to save or publish.</p>
                   )}
                   
                   <div className="flex gap-4 items-center flex-wrap justify-center">
                     <button onClick={() => setCurrentStep(3)} className="font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest text-[10px] underline underline-offset-4">Change Settings</button>
                     <button onClick={handleStartOver} className="text-red-500 font-bold hover:text-red-400 transition-colors uppercase tracking-widest text-[10px] underline underline-offset-4">Start Over</button>
                     
                     <motion.button
                       whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                       disabled={isPublishing || questions.filter(q => q.status === "accepted").length === 0}
                       onClick={() => handlePublish("standalone")}
                       className="bg-emerald-600 text-white font-black py-3 px-8 rounded-full hover:opacity-90 transition shadow-xl text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-30"
                     >
                       {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                       Save to My Assessments
                     </motion.button>

                     <motion.button
                       whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                       disabled={questions.filter(q => q.status === "accepted").length === 0}
                       onClick={openPublishModal}
                       className="bg-blue-600 dark:bg-blue-500 text-white font-black py-3 px-8 rounded-full hover:opacity-90 transition shadow-xl text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-30"
                     >
                       <BookOpen className="w-4 h-4" /> Publish to Course
                     </motion.button>
                   </div>
                </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sync Status */}
      <div className="fixed bottom-8 left-8 bg-white dark:bg-[#222222] border border-gray-200 dark:border-white/10 px-5 py-2.5 rounded-full flex items-center gap-3 shadow-xl z-50">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
        <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">Changes Saved</span>
      </div>

      {/* Feedback Modal */}
      <AnimatePresence>
        {feedbackModal.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFeedbackModal(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#1A1A1A] rounded-[32px] shadow-2xl overflow-hidden border border-gray-200 dark:border-white/10"
            >
              <div className="px-8 py-6 border-b border-gray-100 dark:border-white/5 flex items-center gap-4 bg-gray-50/50 dark:bg-white/[0.02]">
                <div className="p-3 bg-primary/10 rounded-2xl"><MessageSquare className="w-5 h-5 text-primary" /></div>
                <div>
                   <h3 className="text-sm font-black uppercase tracking-widest">{feedbackModal.type === "full" ? "Improve Question" : "Fix Segment"}</h3>
                   <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Tell Sensai how to polish this for you</p>
                </div>
              </div>

              <div className="p-8">
                 {feedbackModal.type === "segment" && (
                   <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-primary block mb-2 opacity-60">Targeting Segment:</span>
                      <p className="text-xs font-bold italic">"{feedbackModal.segment}"</p>
                   </div>
                 )}
                 <textarea 
                    autoFocus
                    placeholder="e.g., Make it more conceptual, change technical focus, or fix a typo..."
                    className="w-full h-32 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-5 text-sm font-medium resize-none outline-none focus:border-primary transition-all shadow-inner"
                    value={feedbackModal.feedback}
                    onChange={(e) => setFeedbackModal(prev => ({ ...prev, feedback: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        executeRegeneration();
                      }
                      if (e.key === "Escape") setFeedbackModal(prev => ({ ...prev, isOpen: false }));
                    }}
                 />
                 <div className="mt-6 flex gap-3">
                    <button 
                      onClick={() => setFeedbackModal(prev => ({ ...prev, isOpen: false }))}
                      className="flex-1 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={executeRegeneration}
                      disabled={!feedbackModal.feedback.trim()}
                      className="flex-[2] bg-primary text-primary-foreground px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all active:scale-95"
                    >
                      <Send className="w-4 h-4" /> Send to Sensai
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Dialog Modal (Alert/Confirm) */}
      <AnimatePresence>
        {dialog.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
               className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }}
               className="relative w-full max-w-md bg-white dark:bg-[#1A1A1A] rounded-[32px] overflow-hidden shadow-2xl border border-gray-100 dark:border-white/10"
            >
               <div className="p-10 flex flex-col items-center text-center">
                  <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-8 ${dialog.type === 'error' ? 'bg-red-500/10 text-red-500' : dialog.type === 'warning' ? 'bg-amber-500/10 text-amber-500' : 'bg-primary/10 text-primary'}`}>
                     {dialog.type === 'error' ? <AlertCircle className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
                  </div>
                  <h3 className="text-xl font-black mb-3 tracking-tight uppercase leading-none">{dialog.title}</h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-10">{dialog.message}</p>
                  
                  <div className="w-full flex gap-3">
                     {dialog.onConfirm ? (
                       <>
                         <button 
                            onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                            className="flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                         >
                           Cancel
                         </button>
                         <button 
                            onClick={() => {
                               dialog.onConfirm?.();
                               setDialog(prev => ({ ...prev, isOpen: false }));
                            }}
                            className="flex-[2] bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                         >
                           Reset & Continue
                         </button>
                       </>
                     ) : (
                       <button 
                          onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                          className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                       >
                         Understood
                       </button>
                     )}
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Publish Modal */}
      <AnimatePresence>
        {isPublishModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !isPublishing && setIsPublishModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-[#111111] rounded-[40px] shadow-3xl overflow-hidden border border-gray-100 dark:border-white/10"
            >
              <div className="p-10">
                <div className="flex items-center gap-6 mb-10">
                  <div className="w-16 h-16 bg-blue-600/10 rounded-3xl flex items-center justify-center border border-blue-600/20">
                    <Building className="w-8 h-8 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight uppercase">Publish to Course</h2>
                    <p className="text-sm text-muted-foreground font-medium">Integrate this assessment as a quiz in your active curriculum.</p>
                  </div>
                </div>

                {publishSuccess ? (
                  <div className="py-20 flex flex-col items-center text-center">
                    <div className="w-24 h-24 bg-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-2xl shadow-emerald-500/40">
                      <CheckCircle className="w-12 h-12 text-white" />
                    </div>
                    <h3 className="text-2xl font-black mb-2 uppercase">Assessment Live!</h3>
                    <p className="text-muted-foreground">Successfully published to <b>{selectedCourse?.name}</b></p>
                    <div className="mt-8 flex gap-2 items-center text-emerald-500 font-bold animate-pulse uppercase tracking-[0.2em] text-[10px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Redirecting to Dashboard
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Course Selection */}
                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Select Target Course</label>
                      <div className="grid grid-cols-1 gap-3 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                        {availableCourses.map((course) => (
                          <button
                            key={course.id}
                            onClick={() => { setSelectedCourse(course); setSelectedMilestone(null); }}
                            className={`p-5 rounded-2xl border text-left flex items-center justify-between transition-all group ${
                              selectedCourse?.id === course.id 
                                ? 'bg-blue-600/10 border-blue-600 shadow-lg' 
                                : 'bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/5 hover:border-gray-200 dark:hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-xl transition-all ${selectedCourse?.id === course.id ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-white/10'}`}>
                                <BookOpen className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm">{course.name}</span>
                            </div>
                            {selectedCourse?.id === course.id && <ArrowRight className="w-4 h-4 text-blue-500" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Milestone Selection (Conditional) */}
                    <AnimatePresence>
                      {selectedCourse && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                          className="space-y-4"
                        >
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-2">Select Milestone (Module)</label>
                          <div className="flex flex-wrap gap-2">
                            {selectedCourse.milestones.map((m: any) => (
                              <button
                                key={m.id}
                                onClick={() => setSelectedMilestone(m)}
                                className={`px-6 py-3 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all ${
                                  selectedMilestone?.id === m.id 
                                    ? 'bg-blue-600 text-white border-blue-600' 
                                    : 'bg-white dark:bg-white/5 border-gray-100 dark:border-white/10 text-muted-foreground'
                                }`}
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Footer Actions */}
                    <div className="pt-10 flex gap-4">
                      <button 
                        disabled={isPublishing}
                        onClick={() => setIsPublishModalOpen(false)}
                        className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button 
                        disabled={isPublishing || !selectedCourse || !selectedMilestone}
                        onClick={() => handlePublish("course")}
                        className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-600/30 disabled:opacity-30 transition-all hover:scale-[1.02] active:scale-95"
                      >
                        {isPublishing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Synchronizing...
                          </>
                        ) : (
                          <>
                            Confirm & Publish
                            <ArrowUpRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AssessmentPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-white dark:bg-[#1A1A1A]"><Loader2 className="w-10 h-10 animate-spin text-foreground" /></div>}>
      <AssessmentContent />
    </Suspense>
  );
}

"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { 
  Loader2, Plus, Trash2, CheckCircle, XCircle, LayoutDashboard, Layers, 
  PieChart, BookOpen, BrainCircuit, FileText, ChevronRight, Upload, 
  RefreshCw, Save, Download, AlertTriangle, Edit3, Sparkles 
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

function normalizePercentages(map: Record<string, number>, keyChanged: string, newVal: number): Record<string, number> {
  const newMap = { ...map };
  newMap[keyChanged] = newVal;
  
  const keys = Object.keys(newMap).filter(k => k !== keyChanged);
  if (keys.length === 0) return newMap;
  
  const remaining = Math.max(0, 100 - newVal);
  let otherSum = keys.reduce((acc, k) => acc + newMap[k], 0);
  
  if (otherSum === 0) {
    const split = remaining / keys.length;
    keys.forEach(k => newMap[k] = Math.round(split));
  } else {
    keys.forEach(k => {
      newMap[k] = Math.round((newMap[k] / otherSum) * remaining);
    });
  }
  
  const finalSum = Object.values(newMap).reduce((a, b) => a + b, 0);
  if (finalSum !== 100 && keys.length > 0) {
    newMap[keys[0]] += (100 - finalSum);
  }
  return newMap;
}

function AssessmentContent() {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "recruiter" ? "recruiter" : "educator";
  const [mode, setMode] = useState<"educator" | "recruiter">(initialMode);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // Phase 1
  const [curriculumText, setCurriculumText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

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
      alert("Failed to get text from file.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleParseCurriculum = async () => {
    if (!curriculumText.trim()) return;
    setIsParsing(true);
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/parse-curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum_text: curriculumText }),
      });
      const data = await res.json();
      const modArr = data.modules.map((m: any) => ({ name: m.name, selected: true, suggested: false }));
      const sugArr = data.suggested_modules.map((m: any) => ({ name: m.name, selected: false, suggested: true, reason: m.reason }));
      setModules([...modArr, ...sugArr]);
      const skArr = data.skills.map((s: any) => ({ name: s.name, selected: true, type: s.type }));
      setSkills(skArr);
      setCurrentStep(2);
    } catch (e) {
      alert("Failed to read the content.");
    } finally {
      setIsParsing(false);
    }
  };

  // Phase 2
  const [modules, setModules] = useState<{name: string, selected: boolean, suggested: boolean, reason?: string}[]>([]);
  const [skills, setSkills] = useState<{name: string, selected: boolean, type: string}[]>([]);
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
      setModules([...modules, { name: validatedName, selected: true, suggested: false }]);
      setNewModuleName("");
    }
  };

  const addSkill = async () => {
    if (!newSkillName.trim() || isValidatingAddition) return;
    const validatedName = await validateAddition(newSkillName, "skill");
    if (validatedName) {
      setSkills([...skills, { name: validatedName, selected: true, type: "core" }]);
      setNewSkillName("");
    }
  };

  // Phase 3
  const [questionTypes, setQuestionTypes] = useState({ MCQ: 10, Coding: 2, CaseBased: 1 });
  const [moduleCoverage, setModuleCoverage] = useState<Record<string, number>>({});
  const [skillMapping, setSkillMapping] = useState<Record<string, number>>({
    "Theory": 50,
    "Problem Solving": 30,
    "Application": 20
  });
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const selectedMods = modules.filter(m => m.selected);
    if (selectedMods.length > 0 && currentStep === 3) {
      const defaultCov = 100 / selectedMods.length;
      const initialMap: Record<string, number> = {};
      selectedMods.forEach(m => initialMap[m.name] = Math.round(defaultCov));
      const sum = Object.values(initialMap).reduce((a,b)=>a+b, 0);
      if(sum !== 100 && selectedMods.length > 0) initialMap[selectedMods[0].name] += (100 - sum);
      setModuleCoverage(initialMap);
    }
  }, [modules, currentStep]);

  const handleModuleCoverageChange = (name: string, val: number) => {
    setModuleCoverage(prev => normalizePercentages(prev, name, val));
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
          skill_mapping: skillMapping
        }),
      });
      const data = await res.json();
      setQuestions(data.questions.map((q: any) => ({ ...q, status: "pending" })));
      setCurrentStep(4);
    } catch (e) {
      alert("Failed to create questions.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Phase 4
  const [questions, setQuestions] = useState<(GeneratedQuestion & {status: "pending"|"accepted"|"rejected"|"edited", isRegenerating?: boolean})[]>([]);

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
          }
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
            current_step: currentStep,
            curriculum_text: curriculumText,
            modules,
            skills,
            config: { questionTypes, moduleCoverage, skillMapping },
            questions
          }
        })
      });
    } catch (e) { console.error("Save draft error", e); }
  };

  useEffect(() => {
    if (isMounted) saveDraft();
  }, [currentStep, curriculumText, modules, skills, questionTypes, moduleCoverage, skillMapping, questions]);

  const handleRegenerate = async (id: string) => {
    const qIndex = questions.findIndex(q => q.id === id);
    if (qIndex === -1) return;
    const feedback = window.prompt("How can we improve this question?");
    if (!feedback) return;
    const newQs = [...questions];
    newQs[qIndex].isRegenerating = true;
    setQuestions(newQs);
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/regenerate-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questions[qIndex], feedback })
      });
      const data = await res.json();
      const updatedQs = [...questions];
      updatedQs[qIndex] = { ...data.question, status: "edited", isRegenerating: false };
      setQuestions(updatedQs);
    } catch(e) {
      alert("Failed to update question.");
      const resetQs = [...questions];
      resetQs[qIndex].isRegenerating = false;
      setQuestions(resetQs);
    }
  };

  const handleRegenerateSegment = async (id: string, segment: string) => {
    const qIndex = questions.findIndex(q => q.id === id);
    if (qIndex === -1) return;
    const feedback = window.prompt(`How should we fix: "${segment}"?`);
    if (!feedback) return;
    try {
      const res = await fetch("http://localhost:8001/assessments_v3/regenerate-segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_text: segment, feedback, context: questions[qIndex].question_text })
      });
      const data = await res.json();
      const updatedQs = [...questions];
      updatedQs[qIndex].question_text = updatedQs[qIndex].question_text.replace(segment, data.updated_text);
      setQuestions(updatedQs);
    } catch(e) { alert("Failed to fix that part."); }
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
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "assessment.pdf";
      a.click();
    } catch (e) { alert("Failed to download PDF."); }
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
              <span className="text-sm font-medium px-2 py-1 bg-gray-100 dark:bg-white/10 rounded-lg text-muted-foreground uppercase tracking-widest leading-none">Smart Mode</span>
            </h1>
            <p className="text-muted-foreground mt-2 font-medium">Build professional tests and quizzes effortlessly.</p>
          </div>
          
          <div className="flex bg-gray-100 dark:bg-[#222222] rounded-xl p-1 shadow-sm border border-gray-200 dark:border-transparent">
            <button 
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === "educator" ? "bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm" : "text-muted-foreground hover:text-black dark:hover:text-white"}`}
              onClick={() => { setMode("educator"); setCurrentStep(1); }}
            >
              For Teachers
            </button>
            <button 
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === "recruiter" ? "bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm" : "text-muted-foreground hover:text-black dark:hover:text-white"}`}
              onClick={() => setMode("recruiter")} 
            >
              For Hiring
            </button>
          </div>
        </motion.div>

        {/* Navigation / Progress */}
        <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto bg-gray-50 dark:bg-[#222222]/30 p-4 rounded-2xl border border-gray-200 dark:border-white/5">
           {[ 
             { id: 1, label: "Add Content", icon: FileText },
             { id: 2, label: "Review Topics", icon: Layers },
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
                {i < 3 && <div className={`h-px flex-1 rounded-full transition-all duration-700 ${currentStep > st.id ? "bg-emerald-500" : "bg-gray-200 dark:bg-white/10"}`} />}
             </React.Fragment>
           ))}
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
               <h2 className="text-2xl font-bold mb-2 tracking-tight">Step 1: Upload or Paste Content</h2>
               <p className="text-muted-foreground text-sm mb-8 font-medium">Add your syllabus, notes, or job descriptions to get started.</p>
               
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
                     <h2 className="text-lg font-bold">Topics Found</h2>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Main subjects to test</p>
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
                                {m.suggested && <span className="text-[9px] uppercase bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">Recommended</span>}
                              </h4>
                              {m.reason && <p className="text-xs text-muted-foreground mt-1 font-medium">{m.reason}</p>}
                           </div>
                           <button onClick={() => setModules(modules.filter((_, idx)=>idx!==i))} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all"><Trash2 className="w-4 h-4"/></button>
                         </div>
                      </motion.div>
                    ))}
                 </div>
                 <div className="p-6 border-t border-gray-100 dark:border-[#333333] flex gap-3">
                   <input type="text" placeholder="Add custom topic..." value={newModuleName} onChange={e=>setNewModuleName(e.target.value)} className="flex-1 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-[#333333] rounded-xl px-5 py-3 text-sm outline-none focus:border-black dark:focus:border-white" />
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
               <h2 className="text-2xl font-bold flex items-center gap-3 mb-12 tracking-tight">
                 Question Setup
               </h2>
               
               <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                 <div className="space-y-8">
                    <h3 className="font-bold text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-6 flex items-center gap-2">Numbers <div className="h-px flex-1 bg-gray-100 dark:bg-white/5"/></h3>
                    <div className="space-y-4">
                       {Object.entries({ MCQ: "Multiple Choice", Coding: "Coding Problems", CaseBased: "Scenario Based" }).map(([key, label]) => (
                         <div key={key} className="flex justify-between items-center bg-gray-50 dark:bg-black/40 p-4 rounded-2xl border border-gray-100 dark:border-white/5 group transition-all">
                           <span className="font-bold text-[13px]">{label}</span>
                           <input 
                             type="number" min="0" 
                             value={questionTypes[key as keyof typeof questionTypes]} 
                             onChange={(e)=>setQuestionTypes({...questionTypes, [key]: parseInt(e.target.value) || 0})} 
                             className="w-16 bg-white dark:bg-black border border-gray-200 dark:border-white/10 rounded-lg py-1.5 text-center font-bold outline-none focus:border-primary" 
                           />
                         </div>
                       ))}
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
                               className="h-full bg-black dark:bg-white rounded-full" 
                             />
                             <input 
                                type="range" min="0" max="100" step="5"
                                value={moduleCoverage[m.name] || 0}
                                onChange={(e) => handleModuleCoverageChange(m.name, parseInt(e.target.value))}
                                className="absolute inset-0 w-full opacity-0 cursor-pointer"
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
                               className="absolute inset-0 w-full opacity-0 cursor-pointer"
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
               <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-gray-200 dark:border-[#333333] pb-10">
                 <div className="max-w-2xl">
                    <h2 className="text-3xl font-bold tracking-tight">Final Review</h2>
                    <p className="text-muted-foreground mt-2 font-medium">Review the generated questions. You can edit any part of the text directly.</p>
                 </div>
                 <div className="bg-white dark:bg-black border border-gray-200 dark:border-white/10 px-8 py-3 rounded-2xl font-black text-xl flex items-baseline gap-2 shadow-sm">
                    <span className="text-black dark:text-white">{questions.filter(q => q.status === "accepted").length}</span>
                    <span className="text-muted-foreground text-xs italic">/ {questions.length} ACCEPTED</span>
                 </div>
               </div>

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
                        <div className="group relative">
                          <p className="font-bold text-lg leading-relaxed mb-8 pr-10 selection:bg-primary/20">{q.question_text}</p>
                          <button 
                            onClick={() => {
                              const segment = window.getSelection()?.toString() || q.question_text;
                              handleRegenerateSegment(q.id, segment);
                            }}
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
                          <div className="p-5 bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl mb-8 text-xs font-bold text-muted-foreground italic leading-relaxed">
                            {q.answer}
                          </div>
                        )}

                        <div className="bg-gray-50 dark:bg-white/5 p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-2 opacity-80 underline underline-offset-4">Why this answer?</span>
                          <p className="text-[11px] text-foreground/70 font-medium leading-relaxed italic">{q.explanation}</p>
                        </div>

                        <div className="mt-8 pt-8 border-t border-gray-100 dark:border-white/5 flex gap-2 flex-wrap">
                           {q.skills_tested.map(sk => <span key={sk} className="text-[9px] font-bold text-muted-foreground border border-gray-200 dark:border-white/10 rounded-full px-3 py-1 uppercase tracking-tighter">{sk}</span>)}
                           <span className="text-[9px] font-bold text-primary bg-primary/10 rounded-full px-3 py-1 uppercase tracking-widest">{q.cognitive_level}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
               </div>

               <div className="flex flex-col items-center gap-8 py-10 border-t border-gray-100 dark:border-[#333333]">
                  <motion.button 
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={handleExportPDF}
                    className="bg-black dark:bg-white text-white dark:text-black font-black py-5 px-16 rounded-full hover:opacity-90 transition-all flex items-center gap-4 shadow-xl text-lg group"
                  >
                    <Download className="w-6 h-6" /> Download PDF
                  </motion.button>
                  
                  <div className="flex gap-8 items-center">
                    <button onClick={() => setCurrentStep(3)} className="font-bold text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest text-[10px] underline underline-offset-4">Change Settings</button>
                    <button onClick={() => confirm("Reset everything?") && window.location.reload()} className="text-red-500 font-bold hover:text-red-400 transition-colors uppercase tracking-widest text-[10px] underline underline-offset-4">Start Over</button>
                    <button className="bg-gray-100 dark:bg-white/10 text-black dark:text-white font-bold py-3 px-10 rounded-full hover:bg-gray-200 dark:hover:bg-white/20 transition text-xs uppercase tracking-widest">Publish</button>
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

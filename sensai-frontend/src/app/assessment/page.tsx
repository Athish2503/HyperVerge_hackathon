"use client";

import React, { useState } from "react";
import { Loader2, Plus, Trash2, CheckCircle, XCircle, LayoutDashboard, Settings } from "lucide-react";

// --- Types ---
type InputMode = "jd" | "curriculum";

interface AssessmentMetadata {
  title: string;
  type: string;
  target_seniority: string;
  total_estimated_time: string;
}

interface AssessmentItem {
  id: string;
  type: string;
  skill_tag: string;
  sub_skill: string;
  difficulty: "Easy" | "Medium" | "Hard";
  question_text: string;
  options?: string[];
  model_answer: string;
  rationale: string;
  status?: "accepted" | "rejected" | "edited" | "pending";
}

interface Gamification {
  xp: number;
  level: number;
  badges: string[];
  streak: number;
}

interface ValidationOutput {
  coverage: Record<string, number>;
  difficulty_distribution: Record<string, number>;
  alignment_justification: string;
  gamification: Gamification;
}

export default function AssessmentPage() {
  const [inputMode, setInputMode] = useState<InputMode>("jd");
  const [learningMode, setLearningMode] = useState<"learning" | "hiring">("learning");

  // Input states
  const [jdText, setJdText] = useState("");
  const [jdDifficulty, setJdDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<string[]>([""]);

  // Core App states
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<AssessmentMetadata | null>(null);
  const [items, setItems] = useState<AssessmentItem[]>([]);
  const [validation, setValidation] = useState<ValidationOutput | null>(null);

  // --- Handlers ---
  const handleExtractSkills = async () => {
    setIsExtracting(true);
    setValidation(null);
    setItems([]);
    setMetadata(null);

    try {
      const payload: any = { input_type: inputMode };
      if (inputMode === "jd") {
        payload.jd = { raw_text: jdText, difficulty: jdDifficulty };
      } else {
        payload.curriculum = { course_name: courseName, modules: modules.filter((m) => m.trim() !== "") };
      }

      const res = await fetch("http://localhost:8001/assessments/extract-skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json();
      if (data.skills) {
        setExtractedSkills(data.skills);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to extract skills");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleGenerateAssessment = async () => {
    if (extractedSkills.length === 0) return;
    setIsGenerating(true);
    setValidation(null);

    try {
      const inputContext = inputMode === "jd" ? jdText : `Course: ${courseName}, Modules: ${modules.join(', ')}`;
      const res = await fetch("http://localhost:8001/assessments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skills: extractedSkills,
          mode: learningMode,
          difficulty: jdDifficulty,
          input_context: inputContext
        }),
      });
      
      const data = await res.json();
      if (data.items) {
        setItems(data.items.map((q: any) => ({ ...q, status: "pending" })));
        setMetadata(data.metadata);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to generate assessment");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleValidate = async () => {
    setIsValidating(true);
    try {
      const res = await fetch("http://localhost:8001/assessments/validate-coverage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: metadata || { title: "Draft", type: "Evaluation", target_seniority: "Any", total_estimated_time: "N/A" },
          items: items.filter(q => q.status !== "rejected") // Validate only non-rejected
        }),
      });
      
      const data = await res.json();
      setValidation(data);
    } catch (e) {
      console.error(e);
      alert("Failed to validate");
    } finally {
      setIsValidating(false);
    }
  };

  const updateItemStatus = (index: number, status: AssessmentItem["status"]) => {
    const newItems = [...items];
    newItems[index].status = status;
    setItems(newItems);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <LayoutDashboard className="w-8 h-8 text-blue-600" />
              Assessment Intelligence Engine
            </h1>
            <p className="text-slate-500 mt-2">Generate MVP structural assessments dynamically</p>
          </div>
          <div className="flex bg-white rounded-lg shadow-sm p-1 border">
            <button 
              className={`px-4 py-2 rounded-md text-sm font-medium ${learningMode === "learning" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              onClick={() => setLearningMode("learning")}
            >
              Trainer Path (Learning)
            </button>
            <button 
              className={`px-4 py-2 rounded-md text-sm font-medium ${learningMode === "hiring" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-50"}`}
              onClick={() => setLearningMode("hiring")}
            >
              Recruiter Path (Hiring)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Inputs */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400" />
                Input Source
              </h2>
              
              <div className="flex gap-2 mb-6">
                <button 
                  className={`flex-1 py-2 text-sm border rounded-lg font-medium transition-colors ${inputMode === "jd" ? "bg-slate-900 border-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setInputMode("jd")}
                >
                  Job Description
                </button>
                <button 
                  className={`flex-1 py-2 text-sm border rounded-lg font-medium transition-colors ${inputMode === "curriculum" ? "bg-slate-900 border-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => setInputMode("curriculum")}
                >
                  Curriculum
                </button>
              </div>

              {inputMode === "jd" ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target Difficulty</label>
                    <select 
                      className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      value={jdDifficulty}
                      onChange={(e: any) => setJdDifficulty(e.target.value)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Paste JD Text</label>
                    <textarea 
                      className="w-full border rounded-lg p-3 text-sm h-48 outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="e.g. Looking for a React Developer with 3 years of experience in Next.js and SQL..."
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Course Name</label>
                    <input 
                      type="text"
                      className="w-full border rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Full Stack Engineering"
                      value={courseName}
                      onChange={(e) => setCourseName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Syllabus Modules</label>
                    {modules.map((mod, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input 
                          type="text"
                          className="flex-1 border rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder={`Module ${i+1}`}
                          value={mod}
                          onChange={(e) => {
                            const newM = [...modules];
                            newM[i] = e.target.value;
                            setModules(newM);
                          }}
                        />
                        <button 
                          onClick={() => setModules(modules.filter((_, idx) => idx !== i))}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button 
                      onClick={() => setModules([...modules, ""])}
                      className="text-sm text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1 mt-2"
                    >
                      <Plus className="w-4 h-4" /> Add Module
                    </button>
                  </div>
                </div>
              )}

              <button 
                className="w-full mt-6 bg-blue-600 text-white font-medium py-2.5 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-blue-300"
                onClick={handleExtractSkills}
                disabled={isExtracting || (inputMode === "jd" ? !jdText : !courseName)}
              >
                {isExtracting && <Loader2 className="w-4 h-4 animate-spin" />}
                Step 1: Extract Skills
              </button>
            </div>

            {/* Extracted Skills Module */}
            {extractedSkills.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-lg font-semibold mb-4">Extracted Skills</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                  {extractedSkills.map((s, i) => (
                    <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-full outline outline-1 outline-indigo-200">
                      {s}
                    </span>
                  ))}
                </div>
                <button 
                  className="w-full bg-slate-900 text-white font-medium py-2.5 rounded-lg hover:bg-slate-800 transition flex items-center justify-center gap-2 disabled:bg-slate-400"
                  onClick={handleGenerateAssessment}
                  disabled={isGenerating}
                >
                  {isGenerating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Step 2: Generate Questions
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Results & Validation */}
          <div className="lg:col-span-2 space-y-6">
            
            {items.length > 0 && (
              <>
              <div className="flex items-center justify-between">
                 <div>
                   <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">
                      Generated Assessment
                    </h2>
                    {metadata && (
                      <p className="text-sm text-slate-500 font-medium mt-1">
                        {metadata.title} &middot; {metadata.target_seniority} &middot; {metadata.total_estimated_time}
                      </p>
                    )}
                 </div>
                 
                  <button 
                    onClick={handleValidate}
                    disabled={isValidating}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition"
                  >
                    {isValidating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Step 3: Validate Coverage
                  </button>
              </div>

               {/* Validation Panel */}
               {validation && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl mb-6">
                  <div className="col-span-2 md:col-span-4 flex items-center justify-between mb-2">
                     <h3 className="font-semibold text-emerald-800">Coverage & Validation Report</h3>
                     <div className="flex gap-2">
                        {validation.gamification.badges.map((b, i) => (
                          <span key={i} className="text-xs bg-emerald-200 text-emerald-900 px-2 py-1 rounded-md font-bold">🥇 {b}</span>
                        ))}
                     </div>
                  </div>

                  <div className="col-span-2 md:col-span-4 bg-white p-4 rounded-lg border border-emerald-100 shadow-sm text-sm text-slate-700">
                    <span className="font-bold text-emerald-800">Alignment Justification: </span> 
                    {validation.alignment_justification}
                  </div>

                  <div className="col-span-2 bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                     <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Skill Coverage Heatmap</div>
                     <div className="flex flex-wrap gap-2">
                       {Object.entries(validation.coverage).map(([k, v]) => (
                         <span key={k} className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">
                           {k}: {(v as number).toFixed(0)}%
                         </span>
                       ))}
                     </div>
                  </div>

                  <div className="col-span-2 bg-white p-3 rounded-lg border border-emerald-100 shadow-sm">
                     <div className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-2">Difficulty Distribution</div>
                     <div className="flex flex-wrap gap-2">
                       {Object.entries(validation.difficulty_distribution).map(([k, v]) => (
                         <span key={k} className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700">
                           {k}: {(v as number).toFixed(0)}%
                         </span>
                       ))}
                     </div>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {items.map((q, i) => (
                  <div key={q.id || i} className={`bg-white p-5 rounded-xl shadow-sm border transition-all ${q.status === 'rejected' ? 'opacity-50 border-red-200 bg-red-50' : q.status === 'accepted' ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="text-xs font-bold px-2 py-1 bg-slate-100 rounded text-slate-600">{q.skill_tag}</span>
                        <span className="text-xs font-medium px-2 py-1 bg-slate-50 outline outline-1 outline-slate-200 rounded text-slate-600">{q.sub_skill}</span>
                        <span className="text-xs font-bold px-2 py-1 bg-blue-50 text-blue-600 rounded">{q.type}</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded ${q.difficulty === 'Hard' ? 'bg-red-50 text-red-600' : q.difficulty === 'Medium' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'}`}>
                          {q.difficulty}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button 
                          onClick={() => updateItemStatus(i, "accepted")}
                          className={`p-1.5 rounded-md transition ${q.status === 'accepted' ? 'text-emerald-600 bg-emerald-100' : 'text-slate-400 hover:bg-slate-100'}`}
                          title="Accept"
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => updateItemStatus(i, "rejected")}
                          className={`p-1.5 rounded-md transition ${q.status === 'rejected' ? 'text-red-600 bg-red-100' : 'text-slate-400 hover:bg-slate-100'}`}
                          title="Reject"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                    
                    <p className="font-medium text-slate-800 mb-4">{q.question_text}</p>
                    
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 mb-4">
                        {q.options.map((opt, oidx) => (
                          <div key={oidx} className={`p-2.5 rounded-lg text-sm border ${opt === q.model_answer ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium' : 'bg-gray-50 border-gray-100 text-slate-600'}`}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {(q.type !== "MCQ" || !q.options) && (
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg mb-4">
                        <p className="text-sm font-semibold mb-1 text-slate-700">Model Answer:</p>
                        <p className="text-sm text-slate-600">{q.model_answer}</p>
                      </div>
                    )}

                    <div className="text-sm text-slate-500 border-t pt-3 mt-2">
                       <span className="font-semibold text-slate-700">Rationale (Distractor Logic):</span> {q.rationale}
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}

            {!isGenerating && items.length === 0 && extractedSkills.length === 0 && (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <LayoutDashboard className="w-8 h-8 text-slate-300" />
                 </div>
                 <h3 className="text-lg font-medium text-slate-900 mb-1">Awaiting Input</h3>
                 <p className="text-slate-500 max-w-sm">
                    Provide a Job Description or Curriculum on the left to extract skills and generate your custom assessment via the Master AIE.
                 </p>
              </div>
            )}
            
            {isGenerating && (
               <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 border border-slate-200 rounded-2xl bg-white shadow-sm">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-1">Generating Intelligence...</h3>
                  <p className="text-slate-500 max-w-sm">
                     Applying the Accuracy & Filtering Engine Rules. Mapping {extractedSkills.length} domains against {learningMode === 'learning' ? 'Trainer Path' : 'Recruiter Path'} standards.
                  </p>
               </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

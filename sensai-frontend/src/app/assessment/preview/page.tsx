"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Printer, ChevronLeft, Download } from "lucide-react";
import { motion } from "framer-motion";

interface GeneratedQuestion {
  id: string;
  type: string;
  module: string;
  question_text: string;
  options?: string[];
  status: "pending" | "accepted" | "rejected" | "edited";
}

export default function StudentPreview() {
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Technical Assessment");
  const USER_ID = 1;

  useEffect(() => {
    const fetchDraft = async () => {
      try {
        const res = await fetch(`http://localhost:8001/assessments_v3/draft/${USER_ID}`);
        if (res.ok) {
          const data = await res.json();
          if (data.questions) {
            setQuestions(data.questions.filter((q: any) => q.status !== "rejected"));
          }
          if (data.curriculum_text) {
             // Try to find a title from first line of JD/Content or default
             const firstLine = data.curriculum_text.split("\n")[0].substring(0, 50);
             if (firstLine) setTitle(firstLine);
          }
        }
      } catch (e) {
        console.error("Failed to fetch draft", e);
      } finally {
        setLoading(false);
      }
    };
    fetchDraft();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-[#1A1A1A]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black p-4 md:p-10 transition-colors">
      <div className="max-w-4xl mx-auto">
        
        {/* Navigation Bar (Hidden on print) */}
        <div className="flex justify-between items-center mb-10 print:hidden">
           <button 
             onClick={() => window.history.back()} 
             className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
           >
             <ChevronLeft className="w-4 h-4" /> Back to Edit
           </button>
           <div className="flex gap-4">
             <button 
               onClick={handlePrint}
               className="bg-black dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-black/10 active:scale-95 transition-all"
             >
               <Printer className="w-4 h-4" /> Print / Save PDF
             </button>
           </div>
        </div>

        {/* Assessment Paper */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-[#111111] shadow-2xl rounded-[40px] p-10 md:p-20 border border-gray-100 dark:border-white/5 relative overflow-hidden print:shadow-none print:rounded-none print:border-none print:p-0"
        >
          {/* Paper Header */}
          <div className="mb-16 border-b-2 border-gray-100 dark:border-white/5 pb-10">
             <div className="flex justify-between items-start mb-6">
                <div>
                   <h1 className="text-3xl font-black mb-2 tracking-tight">{title}</h1>
                   <p className="text-xs text-muted-foreground font-medium uppercase tracking-[0.2em]">Candidate Assessment Paper</p>
                </div>
                <div className="text-right">
                   <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1">Time Duration</div>
                   <div className="text-lg font-bold">60 Minutes</div>
                </div>
             </div>
             <div className="grid grid-cols-2 gap-8 mt-10">
                <div className="border-b border-gray-400 dark:border-gray-600 pb-1">
                   <span className="text-[8px] font-bold uppercase text-muted-foreground">Candidate Name:</span>
                </div>
                <div className="border-b border-gray-400 dark:border-gray-600 pb-1">
                   <span className="text-[8px] font-bold uppercase text-muted-foreground">Date:</span>
                </div>
             </div>
          </div>

          {/* Instructions */}
          <div className="mb-16 bg-gray-50 dark:bg-white/5 p-8 rounded-3xl border border-gray-200 dark:border-white/5">
              <h4 className="text-[10px] font-black uppercase tracking-widest mb-4">Instructions</h4>
              <ul className="text-xs space-y-2 font-medium text-muted-foreground list-disc pl-5">
                 <li>Read each question carefully before answering.</li>
                 <li>For Multiple Choice Questions (MCQs), cross or tick the correct option.</li>
                 <li>All questions are mandatory unless specified otherwise.</li>
                 <li>Do not use external aids or devices during the assessment.</li>
              </ul>
          </div>

          {/* Questions List */}
          <div className="space-y-16">
             {questions.map((q, idx) => (
               <div key={q.id} className="relative">
                  <div className="flex items-baseline gap-6 mb-6">
                     <span className="text-2xl font-black text-gray-200 dark:text-white/10 shrink-0">{idx + 1}.</span>
                     <p className="text-lg font-bold leading-relaxed">{q.question_text}</p>
                  </div>

                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-12">
                       {q.options.map((opt, oidx) => (
                         <div key={oidx} className="flex items-center gap-4 p-4 border border-gray-200 dark:border-white/10 rounded-2xl">
                            <div className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 dark:border-white/20 text-[10px] font-black shrink-0">
                               {String.fromCharCode(65 + oidx)}
                            </div>
                            <span className="text-sm font-medium">{opt}</span>
                         </div>
                       ))}
                    </div>
                  )}

                  {!q.options && (
                    <div className="h-40 ml-12 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-3xl flex items-center justify-center">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-30">Answer Space</span>
                    </div>
                  )}
               </div>
             ))}
          </div>

          {/* Paper Footer */}
          <div className="mt-32 pt-10 border-t border-gray-100 dark:border-white/5 flex justify-between items-center opacity-50">
             <span className="text-[10px] font-black uppercase tracking-widest">© Sensai Intelligence 2026</span>
             <span className="text-[10px] font-bold">Page 1 of 1</span>
          </div>
        </motion.div>
      </div>
      
      {/* Print Overlay for print mode */}
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .bg-white { background: white !important; }
          .dark { color: black !important; }
          .text-muted-foreground { color: #666 !important; }
        }
      `}</style>
    </div>
  );
}

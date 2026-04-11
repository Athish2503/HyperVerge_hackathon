"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, BrainCircuit, Flag, AlertTriangle, Send } from "lucide-react";
import Link from "next/link";

interface Question {
  id: string;
  type: string;
  module: string;
  question_text: string;
  options?: string[];
}

interface AssessmentData {
  id: number;
  title: string;
  config: any;
  questions: Question[];
}

export default function StudentTestView({ params }: { params: { token: string } }) {
  const [data, setData] = useState<AssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fake state to hold student answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const res = await fetch(`http://localhost:8001/assessments_v3/take/${params.token}`);
        if (!res.ok) {
          throw new Error("Unable to load test. It may be inactive or the link is invalid.");
        }
        const d = await res.json();
        setData(d);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAssessment();
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0a0a0a]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="font-bold text-sm uppercase tracking-widest text-muted-foreground animate-pulse">Loading Your Test...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] p-6">
        <div className="bg-white dark:bg-[#111] border border-red-200 dark:border-red-900/30 p-10 rounded-[32px] text-center max-w-md shadow-2xl">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-black mb-3">Access Denied</h1>
          <p className="text-muted-foreground font-medium text-sm mb-8">{error}</p>
          <Link href="/">
             <button className="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl hover:opacity-90 transition-all">Return to Home</button>
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0a0a0a] p-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 p-12 rounded-[40px] text-center max-w-lg shadow-2xl">
           <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-blue-500/30">
              <Flag className="w-10 h-10 text-white" />
           </div>
           <h1 className="text-3xl font-black mb-3 tracking-tight">Test Submitted!</h1>
           <p className="text-muted-foreground font-medium mb-8">Your responses have been successfully recorded.</p>
           <button onClick={() => window.location.href = "/"} className="bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-foreground font-black px-8 py-4 rounded-2xl uppercase tracking-widest text-[10px] transition-all">Go Home</button>
        </motion.div>
      </div>
    );
  }

  const handleSelectAnswer = (qId: string, ans: string) => {
    setAnswers(prev => ({ ...prev, [qId]: ans }));
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-black dark:text-white font-sans">
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 px-6 md:px-12 py-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
           <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <BrainCircuit className="w-5 h-5 text-white" />
           </div>
           <div>
             <h1 className="font-black text-xl tracking-tight leading-none text-foreground">{data.title}</h1>
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Student Assessment</p>
           </div>
        </div>
        <div className="bg-gray-100 dark:bg-white/5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground border border-gray-200 dark:border-white/10">
          {Object.keys(answers).length} / {data.questions.length} Answered
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="space-y-12">
          {data.questions.map((q, i) => (
            <div key={q.id || i} className="bg-gray-50 dark:bg-[#111] p-8 md:p-10 rounded-[40px] border border-gray-100 dark:border-white/5 shadow-sm">
              <div className="flex items-start gap-5 mb-8">
                <div className="w-12 h-12 bg-white dark:bg-white/10 rounded-2xl flex items-center justify-center font-black text-lg border border-gray-200 dark:border-white/5 flex-shrink-0 shadow-sm">
                  {i + 1}
                </div>
                <div className="pt-2">
                  <h3 className="text-[17px] font-bold leading-relaxed">{q.question_text}</h3>
                </div>
              </div>

              {q.options && q.options.length > 0 ? (
                <div className="space-y-3 pl-1 md:pl-16">
                  {q.options.map((opt, oi) => {
                    const isSelected = answers[q.id] === opt;
                    return (
                      <button 
                        key={oi} 
                        onClick={() => handleSelectAnswer(q.id, opt)}
                        className={`w-full text-left flex items-center gap-4 p-4 rounded-2xl border transition-all ${
                          isSelected 
                            ? "bg-blue-50 dark:bg-blue-500/10 border-blue-500 ring-1 ring-blue-500" 
                            : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-blue-300 dark:hover:border-blue-500/40"
                        }`}
                      >
                        <div className={`w-6 h-6 flex items-center justify-center rounded-lg border text-[10px] font-black transition-colors ${
                          isSelected ? "bg-blue-500 text-white border-blue-500" : "bg-gray-100 dark:bg-black/50 text-muted-foreground border-gray-200 dark:border-white/10"
                        }`}>
                          {String.fromCharCode(65 + oi)}
                        </div>
                        <span className={`font-medium ${isSelected ? "text-blue-900 dark:text-blue-400 font-bold" : "text-foreground"}`}>
                          {opt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="pl-1 md:pl-16">
                  <textarea 
                    placeholder="Type your answer here..."
                    className="w-full h-40 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-5 text-sm font-medium resize-none outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-inner"
                    value={answers[q.id] || ""}
                    onChange={(e) => handleSelectAnswer(q.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 pt-10 border-t border-gray-200 dark:border-white/5 flex justify-end">
           <button 
             onClick={() => {
                if (Object.keys(answers).length < data.questions.length) {
                  if (!confirm("You have unanswered questions. Are you sure you want to submit?")) return;
                }
                setSubmitted(true);
             }}
             className="bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-12 rounded-2xl shadow-xl shadow-blue-500/20 text-xs uppercase tracking-[0.2em] transform active:scale-95 transition-all flex items-center gap-3"
           >
             Submit Assessment <Send className="w-4 h-4" />
           </button>
        </div>
      </main>
    </div>
  );
}

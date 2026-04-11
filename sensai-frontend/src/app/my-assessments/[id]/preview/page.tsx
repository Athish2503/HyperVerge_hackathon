"use client";

import React, { useEffect, useState, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowLeft, Globe, EyeOff, CheckCircle, BrainCircuit, Copy } from "lucide-react";
import Link from "next/link";

interface Question {
  id: string;
  type: string;
  module: string;
  skills_tested: string[];
  cognitive_level: string;
  difficulty: string;
  question_text: string;
  options?: string[];
  answer: string;
  explanation: string;
}

interface AssessmentData {
  id: number;
  title: string;
  config: any;
  questions: Question[];
  status: string;
  share_token?: string;
}

export default function StandaloneAssessmentPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<AssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const res = await fetch(`http://localhost:8001/assessments_v3/my-assessments/${id}/preview`);
        if (res.ok) {
          const d = await res.json();
          setData(d);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchAssessment();
  }, [id]);

  const togglePublish = async () => {
    setIsToggling(true);
    try {
      const res = await fetch(`http://localhost:8001/assessments_v3/my-assessments/${id}/toggle-publish`, {
        method: "POST"
      });
      if (res.ok) {
        const updated = await res.json();
        setData(prev => prev ? { ...prev, status: updated.status } : null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0f0f0f]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0f0f0f]">
        <div className="text-center">
          <h1 className="text-2xl font-black mb-4">Assessment Not Found</h1>
          <Link href="/my-assessments">
            <button className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full text-sm font-black uppercase tracking-widest shadow-xl">
              Go Back
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const isPublished = data.status === "published";

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-[#0f0f0f] text-black dark:text-white font-sans selection:bg-primary/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-[#0f0f0f]/80 backdrop-blur-xl border-b border-gray-200 dark:border-white/5 px-8 py-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Link href="/my-assessments">
            <button className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-all">
              <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
          </Link>
          <div className="h-6 w-px bg-gray-200 dark:bg-white/10" />
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                <BrainCircuit className="w-4 h-4 text-primary" />
             </div>
             <h1 className="font-black text-xl tracking-tight leading-none">{data.title}</h1>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
            isPublished 
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" 
              : "bg-gray-200 dark:bg-white/5 text-muted-foreground border border-gray-300 dark:border-white/10"
          }`}>
            {isPublished ? <><Globe className="w-3.5 h-3.5" /> Published (Live)</> : <><EyeOff className="w-3.5 h-3.5" /> Draft Mode</>}
          </div>
          
          <button 
            onClick={togglePublish}
            disabled={isToggling}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
              isPublished 
                ? "bg-gray-800 text-white hover:bg-black dark:bg-white/10 dark:hover:bg-white/20" 
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (
              isPublished ? <EyeOff className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />
            )}
            {isPublished ? "Unpublish Assessment" : "Publish Assessment"}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-16">
        <div className="mb-12">
          <h2 className="text-4xl font-black mb-4">Assessment Preview</h2>
          <p className="text-muted-foreground font-medium max-w-2xl text-lg">
            This is how your final assessment looks. You can share this test with users if it is published.
          </p>
          
          {isPublished && data.share_token && (
            <div className="mt-8 bg-blue-500/5 border border-blue-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 justify-between shadow-inner">
              <div>
                <h3 className="font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest text-xs mb-1">Shareable Student Link</h3>
                <p className="text-[13px] font-medium text-muted-foreground">Students can take the test via this link. They will not see any answers or explanations.</p>
              </div>
              <div className="flex items-center gap-2 bg-white dark:bg-black/40 p-2 rounded-2xl border border-gray-200 dark:border-white/10 w-full md:w-auto shadow-sm">
                <code className="px-4 text-xs font-bold text-muted-foreground truncate max-w-[200px] sm:max-w-xs select-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/test/${data.share_token}` : ""}
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/test/${data.share_token}`);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-xl transition-all active:scale-95 shadow-md flex-shrink-0"
                  title="Copy link"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-8">
          {data.questions.map((q, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/5 p-8 rounded-[32px] shadow-sm">
              <div className="flex gap-4 mb-6 relative">
                <div className="w-10 h-10 rounded-2xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-black text-sm flex-shrink-0">
                  {i + 1}
                </div>
                <div className="flex-1 mt-1">
                  <div className="flex gap-2 mb-4">
                    <span className="px-3 py-1 bg-gray-100 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest rounded-lg text-muted-foreground border border-gray-200 dark:border-white/10">{q.type}</span>
                    <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border ${
                      q.difficulty === 'Hard' ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400' :
                      q.difficulty === 'Medium' ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30 dark:text-amber-400' :
                      'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/10 dark:border-green-900/30 dark:text-green-400'
                    }`}>{q.difficulty}</span>
                    <span className="px-3 py-1 bg-gray-100 dark:bg-white/5 text-[10px] font-medium rounded-lg text-muted-foreground border border-gray-200 dark:border-white/10">{q.module}</span>
                  </div>
                  <h3 className="text-xl font-bold leading-relaxed">{q.question_text}</h3>
                </div>
              </div>

              {q.options && q.options.length > 0 && (
                <div className="pl-14 space-y-3">
                  {q.options.map((opt, oi) => {
                    const isCorrect = q.answer === opt;
                    return (
                      <div key={oi} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                        isCorrect 
                          ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/10 dark:border-emerald-900/30 shadow-sm" 
                          : "bg-gray-50 border-gray-200 dark:bg-white/5 dark:border-white/10"
                      }`}>
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${
                          isCorrect ? "bg-emerald-500 text-white" : "bg-gray-200 text-muted-foreground dark:bg-white/10"
                        }`}>
                          {String.fromCharCode(65 + oi)}
                        </div>
                        <span className={`flex-1 font-medium ${isCorrect ? "text-emerald-900 dark:text-emerald-400 font-bold" : ""}`}>
                          {opt}
                        </span>
                        {isCorrect && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                      </div>
                    );
                  })}
                </div>
              )}

              <AnimatePresence>
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="pl-14 mt-6">
                  <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 p-5 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Detailed Explanation</h4>
                    <p className="text-sm font-medium leading-relaxed opacity-90">{q.explanation}</p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}

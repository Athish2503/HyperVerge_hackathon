"use client";

import React, { useEffect, useState, use } from "react";
import { motion } from "framer-motion";
import { Loader2, BrainCircuit, Flag, AlertTriangle, Send, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

interface Question {
  id: string;
  type: string;
  module: string;
  question_text: string;
  options?: string[];
  answer?: string;
  difficulty?: string;
}

interface AssessmentData {
  id: number;
  title: string;
  config: any;
  questions: Question[];
}

export default function StudentTestView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<AssessmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fake state to hold student answers
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    const fetchAssessment = async () => {
      try {
        const res = await fetch(`http://localhost:8001/assessments_v3/take/${token}`);
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
  }, [token]);

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

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`http://localhost:8001/assessments_v3/submit/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      if (res.ok) {
        const resultData = await res.json();
        setResults(resultData);
        setSubmitted(true);
      } else {
        alert("Failed to submit assessment. Please try again.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred while submitting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && results) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] text-black dark:text-white">
        <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-gray-100 dark:border-white/5 px-6 md:px-12 py-5">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <BrainCircuit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight leading-none">{data.title}</h1>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Results</p>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-16">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/10 border border-blue-200 dark:border-blue-900/30 p-10 rounded-[40px] text-center mb-12 shadow-xl">
            <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/30">
              <Flag className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-black mb-3 tracking-tight">Test Submitted!</h1>
            <p className="text-muted-foreground font-medium mb-8">Your responses have been recorded.</p>
            <div className="flex items-center justify-center gap-8 mb-6">
              <div>
                <div className="text-5xl font-black text-blue-600 dark:text-blue-400">{results.score}/{results.total}</div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2">Score</div>
              </div>
              <div className="w-px h-16 bg-gray-300 dark:bg-white/10"></div>
              <div>
                <div className="text-5xl font-black text-blue-600 dark:text-blue-400">{results.percentage}%</div>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2">Percentage</div>
              </div>
            </div>
          </motion.div>

          <h2 className="text-2xl font-black mb-6">Review Answers</h2>
          <div className="space-y-8">
            {results.results.map((q: any, i: number) => {
              return (
                <motion.div key={q.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className={`p-8 rounded-[32px] border shadow-sm ${
                    q.is_correct 
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30" 
                      : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/30"
                  }`}>
                  <div className="flex items-start gap-5 mb-6">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg border shadow-sm ${
                      q.is_correct 
                        ? "bg-emerald-500 text-white border-emerald-600" 
                        : "bg-red-500 text-white border-red-600"
                    }`}>
                      {q.is_correct ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 pt-2">
                      <h3 className="text-[17px] font-bold leading-relaxed mb-2">{q.question_text}</h3>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-white/50 dark:bg-black/20 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-white/10">{q.type}</span>
                        <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border ${
                          q.difficulty === 'Hard' ? 'bg-red-100 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-900/30 dark:text-red-400' :
                          q.difficulty === 'Medium' ? 'bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/30 dark:text-amber-400' :
                          'bg-green-100 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-900/30 dark:text-green-400'
                        }`}>{q.difficulty}</span>
                      </div>
                    </div>
                  </div>

                  {q.options && q.options.length > 0 ? (
                    <div className="pl-1 md:pl-16 space-y-4">
                      <div className="space-y-3">
                        {q.options.map((opt: string, oi: number) => {
                          const isUserAnswer = q.user_answer === opt;
                          const isCorrectAnswer = q.correct_answer === opt;
                          return (
                            <div key={oi} className={`flex items-center gap-4 p-4 rounded-2xl border ${
                              isCorrectAnswer 
                                ? "bg-emerald-100 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800/40" 
                                : isUserAnswer 
                                ? "bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-800/40" 
                                : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10"
                            }`}>
                              <div className={`w-6 h-6 flex items-center justify-center rounded-lg border text-[10px] font-black ${
                                isCorrectAnswer ? "bg-emerald-500 text-white border-emerald-600" :
                                isUserAnswer ? "bg-red-500 text-white border-red-600" :
                                "bg-gray-100 dark:bg-black/50 text-muted-foreground border-gray-200 dark:border-white/10"
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </div>
                              <span className={`font-medium flex-1 ${
                                isCorrectAnswer ? "text-emerald-900 dark:text-emerald-400 font-bold" :
                                isUserAnswer ? "text-red-900 dark:text-red-400 font-bold" :
                                "text-foreground"
                              }`}>
                                {opt}
                              </span>
                              {isCorrectAnswer && <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Correct</span>}
                              {isUserAnswer && !isCorrectAnswer && <span className="text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">Your Answer</span>}
                            </div>
                          );
                        })}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        <div className={`rounded-2xl p-4 border ${
                          !q.user_answer 
                            ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30" 
                            : q.is_correct
                            ? "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/30"
                            : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30"
                        }`}>
                          <div className={`text-[10px] font-black uppercase tracking-widest mb-2 ${
                            !q.user_answer ? "text-amber-600 dark:text-amber-400" :
                            q.is_correct ? "text-emerald-600 dark:text-emerald-400" :
                            "text-red-600 dark:text-red-400"
                          }`}>Your Answer:</div>
                          <div className={`text-sm font-bold ${
                            !q.user_answer ? "text-amber-700 dark:text-amber-300" :
                            q.is_correct ? "text-emerald-900 dark:text-emerald-300" :
                            "text-red-900 dark:text-red-300"
                          }`}>
                            {q.user_answer || "(Not answered)"}
                          </div>
                        </div>
                        
                        <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30 rounded-2xl p-4">
                          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">Correct Answer:</div>
                          <div className="text-sm font-bold text-emerald-900 dark:text-emerald-300">{q.correct_answer}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="pl-1 md:pl-16 space-y-3">
                      <div className={`rounded-2xl p-5 border ${
                        !q.user_answer
                          ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30"
                          : q.is_correct
                          ? "bg-emerald-100 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-800/40"
                          : "bg-red-100 dark:bg-red-900/20 border-red-300 dark:border-red-800/40"
                      }`}>
                        <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${
                          !q.user_answer ? "text-amber-600 dark:text-amber-400" :
                          q.is_correct ? "text-emerald-600 dark:text-emerald-400" :
                          "text-red-600 dark:text-red-400"
                        }`}>Your Answer:</div>
                        <div className={`text-sm font-medium ${
                          !q.user_answer ? "text-amber-700 dark:text-amber-300" :
                          q.is_correct ? "text-emerald-900 dark:text-emerald-300" :
                          "text-red-900 dark:text-red-300"
                        }`}>
                          {q.user_answer || "(No answer provided)"}
                        </div>
                      </div>
                      <div className="bg-emerald-100 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800/40 rounded-2xl p-5">
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">Correct Answer:</div>
                        <div className="text-sm font-medium text-emerald-900 dark:text-emerald-300">{q.correct_answer}</div>
                      </div>
                    </div>
                  )}

                  {q.explanation && (
                    <div className="pl-1 md:pl-16 mt-4">
                      <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 mb-2">Explanation:</div>
                        <div className="text-sm text-blue-900 dark:text-blue-300">{q.explanation}</div>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          <div className="mt-12 flex justify-center">
            <button onClick={() => window.location.href = "/"} className="bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-foreground font-black px-8 py-4 rounded-2xl uppercase tracking-widest text-[10px] transition-all">Go Home</button>
          </div>
        </main>
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
                  setShowConfirmDialog(true);
                } else {
                  handleSubmit();
                }
             }}
             disabled={submitting}
             className="bg-blue-600 hover:bg-blue-700 text-white font-black py-5 px-12 rounded-2xl shadow-xl shadow-blue-500/20 text-xs uppercase tracking-[0.2em] transform active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {submitting ? (
               <>
                 <Loader2 className="w-4 h-4 animate-spin" />
                 Submitting...
               </>
             ) : (
               <>
                 Submit Assessment <Send className="w-4 h-4" />
               </>
             )}
           </button>
        </div>

        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} 
              className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/10 p-8 rounded-[32px] max-w-md w-full shadow-2xl">
              <div className="w-16 h-16 bg-amber-50 dark:bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-xl font-black text-center mb-3">Incomplete Assessment</h2>
              <p className="text-muted-foreground text-center font-medium mb-8">
                You have unanswered questions. Are you sure you want to submit?
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-foreground font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    setShowConfirmDialog(false);
                    handleSubmit();
                  }}
                  disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-[10px] transition-all disabled:opacity-50"
                >
                  Submit Anyway
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

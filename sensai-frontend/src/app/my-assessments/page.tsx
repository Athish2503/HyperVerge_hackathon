"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileText, CheckCircle, Clock, Search, Plus, Trash2, Eye,
  BookOpen, ArrowRight, Layers, Edit3, Save, X, Loader2,
  Building, Target, Globe, RefreshCw, ExternalLink, MessageSquare, CopyPlus
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/layout/header";

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
  status?: string;
}

interface AssessmentRecord {
  id: number;
  type: "draft" | "published";
  status: string;
  title: string;
  questions_count: number;
  created_at: string;
  updated_at: string;
  version?: number;
  course_id?: number;
  milestone_id?: number;
  task_id?: number;
  share_token?: string;
  questions?: Question[];
}

interface Course {
  id: number;
  name: string;
  milestones: { id: number; name: string }[];
}

const API = "http://localhost:8001/assessments_v3";

export default function MyAssessmentsPage() {
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");

  // Edit mode
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingQuestions, setEditingQuestions] = useState<Question[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [inlineEditingQId, setInlineEditingQId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: "full", qId: "", segment: "", feedback: "" });

  // Custom Alert Dialog
  const [dialog, setDialog] = useState<{isOpen: boolean, title: string, message: string}>({isOpen: false, title: "", message: ""});
  const showAlert = (title: string, message: string) => {
    setDialog({ isOpen: true, title, message });
  };

  // Full question editor modal
  const [questionEditorOpen, setQuestionEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editingQIdx, setEditingQIdx] = useState<number>(-1);

  // Publish to course modal
  const [publishModal, setPublishModal] = useState<{ open: boolean; assessmentId: number | null; title: string }>({ open: false, assessmentId: null, title: "" });
  const [courses, setCourses] = useState<Course[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<{ id: number; name: string } | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // Detail panel
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<AssessmentRecord | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchAssessments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/my-assessments`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAssessments(data);
    } catch (err) {
      console.error("Failed to fetch assessments", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAssessments(); }, [fetchAssessments]);

  const fetchDetail = async (id: number) => {
    setLoadingDetail(true);
    setDetailId(id);
    try {
      const res = await fetch(`${API}/my-assessments/${id}?assessment_type=published`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setDetailData(data);
    } catch {
      setDetailData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const startEditing = (assessment: AssessmentRecord) => {
    setEditingId(assessment.id);
    setEditingTitle(assessment.title);
    // Load current questions from detail if available
    if (detailData && detailData.id === assessment.id) {
      setEditingQuestions(detailData.questions || []);
    } else {
      fetchDetailForEdit(assessment.id);
    }
  };

  const fetchDetailForEdit = async (id: number) => {
    try {
      const res = await fetch(`${API}/my-assessments/${id}?assessment_type=published`);
      if (res.ok) {
        const data = await res.json();
        setEditingQuestions(data.questions || []);
      }
    } catch { }
  };

  const handleUpdateQuestion = (id: string, updates: Partial<Question>) => {
    setEditingQuestions(prev => prev.map(q => q.id === id ? { ...q, ...updates, status: "edited" } : q));
  };

  const handleAddOption = (qId: string) => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        return { ...q, options: [...q.options, "New Option"], status: "edited" };
      }
      return q;
    }));
  };

  const handleDeleteOption = (qId: string, optIdx: number) => {
    setEditingQuestions(prev => prev.map(q => {
      if (q.id === qId && q.options) {
        const newOpts = q.options.filter((_, i) => i !== optIdx);
        const newAns = q.answer === q.options[optIdx] ? newOpts[0] || "" : q.answer;
        return { ...q, options: newOpts, answer: newAns, status: "edited" };
      }
      return q;
    }));
  };

  const handleRegenerate = (id: string) => {
    setFeedbackModal({ isOpen: true, type: "full", qId: id, feedback: "" });
  };

  const executeRegeneration = async () => {
    const { type, qId, feedback, segment } = feedbackModal;
    setFeedbackModal(prev => ({ ...prev, isOpen: false }));
    
    const qIndex = editingQuestions.findIndex(q => q.id === qId);
    if (qIndex === -1) return;

    const newQs = [...editingQuestions];
    newQs[qIndex] = { ...newQs[qIndex], status: "regenerating" };
    setEditingQuestions(newQs);

    try {
      if (type === "full") {
        const res = await fetch(`${API}/regenerate-question`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: editingQuestions[qIndex], feedback })
        });
        const data = await res.json();
        const updatedQs = [...editingQuestions];
        updatedQs[qIndex] = { ...data.question, status: "edited" };
        setEditingQuestions(updatedQs);
      } else {
        const res = await fetch(`${API}/regenerate-segment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ original_text: segment, feedback, context: editingQuestions[qIndex].question_text })
        });
        const data = await res.json();
        const updatedQs = [...editingQuestions];
        updatedQs[qIndex].question_text = updatedQs[qIndex].question_text.replace(segment || "", data.updated_text);
        updatedQs[qIndex] = { ...updatedQs[qIndex], status: "edited" };
        setEditingQuestions(updatedQs);
      }
    } catch(e) {
      showAlert("Refresh Failed", "Could not refresh this question. The model might be busy.");
      const resetQs = [...editingQuestions];
      delete resetQs[qIndex].status;
      setEditingQuestions(resetQs);
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`${API}/my-assessments/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingTitle, questions: editingQuestions })
      });
      if (res.ok) {
        setDetailData(prev => prev ? { ...prev, title: editingTitle, questions: editingQuestions } : null);
        setAssessments(prev => prev.map(a => a.id === editingId ? { ...a, title: editingTitle, questions_count: editingQuestions.length } : a));
        setEditingId(null);
        setInlineEditingQId(null);
      } else {
        throw new Error("Save failed");
      }
    } catch {
      showAlert("Update Failed", "Failed to save changes.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const duplicateAssessment = async (id: number) => {
    try {
      const res = await fetch(`${API}/my-assessments/${id}/create-version`, { method: "POST" });
      if (res.ok) {
        await fetchAssessments();
      } else {
        showAlert("Duplication Failed", "Failed to duplicate assessment.");
      }
    } catch {
      showAlert("Duplication Failed", "Failed to duplicate assessment.");
    }
  };

  const deleteAssessment = async (id: number) => {
    try {
      await fetch(`${API}/my-assessments/${id}`, { method: "DELETE" });
      setAssessments(prev => prev.filter(a => a.id !== id));
      if (detailId === id) { setDetailId(null); setDetailData(null); }
      setDeleteConfirm(null);
    } catch {
      showAlert("Delete Failed", "Failed to delete assessment.");
    }
  };

  const openPublishModal = async (id: number, title: string) => {
    setPublishModal({ open: true, assessmentId: id, title });
    setSelectedCourse(null);
    setSelectedMilestone(null);
    setPublishSuccess(false);
    setLoadingCourses(true);
    try {
      const res = await fetch(`${API}/available-courses`);
      const data = await res.json();
      setCourses(data);
    } catch { setCourses([]); }
    finally { setLoadingCourses(false); }
  };

  const handlePublishToCourse = async () => {
    if (!publishModal.assessmentId || !selectedCourse || !selectedMilestone) return;
    setIsPublishing(true);
    try {
      const res = await fetch(`${API}/publish-to-course/${publishModal.assessmentId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: publishModal.title,
          config: {},
          questions: [],
          publish_type: "course",
          course_id: selectedCourse.id,
          milestone_id: selectedMilestone.id
        })
      });
      if (!res.ok) throw new Error("Publish failed");
      setPublishSuccess(true);
      setTimeout(() => {
        setPublishModal({ open: false, assessmentId: null, title: "" });
        fetchAssessments();
        setPublishSuccess(false);
      }, 2000);
    } catch (e: any) {
      showAlert("Publish Failed", e.message || "Failed to publish to course.");
    } finally {
      setIsPublishing(false);
    }
  };

  const openQuestionEditor = (q: Question, idx: number) => {
    setEditingQuestion({ ...q });
    setEditingQIdx(idx);
    setQuestionEditorOpen(true);
  };

  const saveQuestion = () => {
    if (!editingQuestion || editingQIdx < 0) return;
    const updated = [...editingQuestions];
    updated[editingQIdx] = editingQuestion;
    setEditingQuestions(updated);
    setQuestionEditorOpen(false);
    setEditingQuestion(null);
    setEditingQIdx(-1);
  };

  const filteredAssessments = assessments
    .filter(a => {
      const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase());
      let matchesFilter = false;
      
      if (filter === "all") {
        matchesFilter = true;
      } else if (filter === "published") {
        matchesFilter = a.type === "published" && a.status === "published";
      } else if (filter === "draft") {
        matchesFilter = a.type === "draft";
      }
      
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
    catch { return dateStr; }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0f0f0f] text-black dark:text-white font-sans">
      <Header />

      <div className="max-w-7xl mx-auto px-8 py-10">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <motion.h1 initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="text-4xl font-black tracking-tight">
              My Assessments
            </motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="text-muted-foreground mt-2 font-medium">
              Manage, edit, and publish your generated assessments.
            </motion.p>
          </div>
          <Link href="/assessment">
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 px-6 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-sm shadow-xl hover:opacity-90 transition-all">
              <Plus className="w-4 h-4" /> Generate New
            </motion.button>
          </Link>
        </div>

        {/* Controls */}
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search assessments..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl outline-none focus:border-black dark:focus:border-white transition-all text-sm" />
          </div>
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl">
            {(["all", "draft", "published"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${filter === f ? "bg-black dark:bg-white text-white dark:text-black shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {f}
              </button>
            ))}
          </div>
          <button onClick={fetchAssessments}
            className="p-3 rounded-2xl border border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5 transition-all">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Main Layout */}
        <div className={`flex gap-6 transition-all ${detailId ? "flex-col lg:flex-row" : ""}`}>
          {/* Assessment Grid / List */}
          <div className={detailId ? "lg:w-[420px] flex-shrink-0" : "w-full"}>
            {loading ? (
              <div className={`grid gap-4 ${detailId ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
                {[1, 2, 3].map(i => <div key={i} className="h-52 bg-gray-100 dark:bg-white/5 animate-pulse rounded-3xl" />)}
              </div>
            ) : filteredAssessments.length > 0 ? (
              <div className={`grid gap-4 ${detailId ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
                <AnimatePresence mode="popLayout">
                  {filteredAssessments.map((a, idx) => (
                    <motion.div key={`${a.type}-${a.id}`}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: idx * 0.04 }}
                      onClick={() => { if (a.type === "published") fetchDetail(a.id); }}
                      className={`group relative bg-white dark:bg-[#1a1a1a] border transition-all rounded-3xl p-6 flex flex-col cursor-pointer shadow-sm hover:shadow-md ${
                        detailId === a.id 
                          ? "border-black dark:border-white ring-2 ring-black/10 dark:ring-white/10" 
                          : "border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20"
                      }`}>
                      
                      {/* Status badge */}
                      <div className="flex justify-between items-start mb-4">
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] uppercase font-black tracking-widest ${
                          a.type === "published"
                            ? a.course_id ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                              : a.status === "published" ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" : "bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}>
                          {a.type === "published" ? (a.course_id ? <><BookOpen className="w-3 h-3" />In Course</> : <><Globe className="w-3 h-3" />{a.status === "published" ? "Published" : "Unpublished"}</>) : <><Clock className="w-3 h-3" />Draft</>}
                        </div>
                        
                        {/* Actions menu */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all" onClick={e => e.stopPropagation()}>
                          {a.type === "published" && (
                            <>
                              <button onClick={() => startEditing(a)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-all text-muted-foreground hover:text-foreground"
                                title="Edit">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => openPublishModal(a.id, a.title)}
                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all text-muted-foreground hover:text-blue-500"
                                title="Publish to Course">
                                <Building className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => duplicateAssessment(a.id)}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all text-muted-foreground hover:text-emerald-500"
                                title="Duplicate as New Version">
                                <CopyPlus className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button onClick={() => setDeleteConfirm(a.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-all text-muted-foreground hover:text-red-500"
                            title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 mb-4">
                        {editingId === a.id ? (
                          <input value={editingTitle} onChange={e => setEditingTitle(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-xl px-3 py-2 font-bold text-base outline-none focus:border-primary mb-2"
                            autoFocus />
                        ) : (
                          <h3 className="font-black text-base leading-tight mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                            {a.title}
                          </h3>
                        )}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{a.questions_count} Questions</span>
                          {a.version && <span className="flex items-center gap-1"><Target className="w-3 h-3" />v{a.version}</span>}
                          <span>{formatDate(a.updated_at)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      {editingId === a.id ? (
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setEditingId(null)}
                            className="flex-1 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-gray-200 dark:border-white/10 rounded-xl transition-all">
                            Cancel
                          </button>
                          <button onClick={saveEdit} disabled={isSavingEdit}
                            className="flex-[2] py-2 bg-black dark:bg-white text-white dark:text-black font-black text-[9px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 disabled:opacity-50">
                            {isSavingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                          {a.type === "published" && (
                            <>
                              <button onClick={() => fetchDetail(a.id)}
                                className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-50 dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                                <Eye className="w-3.5 h-3.5" /> View
                              </button>
                              {!a.course_id && (
                                <Link href={`/my-assessments/${a.id}/preview`} className="flex-[1.5]">
                                  <button className="w-full flex items-center justify-center gap-1 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                    <Globe className="w-3.5 h-3.5" /> Preview
                                  </button>
                                </Link>
                              )}
                              {a.course_id && (
                                <Link href={`/school/${a.org_id}/courses/${a.course_id}`} className="flex-[1.5]">
                                  <button className="w-full flex items-center justify-center gap-1 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                    <ExternalLink className="w-3.5 h-3.5" /> Course
                                  </button>
                                </Link>
                              )}
                            </>
                          )}
                          {a.type === "draft" && (
                            <Link href="/assessment" className="flex-1">
                              <button className="w-full flex items-center justify-center gap-1 py-2 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                                Continue <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </Link>
                          )}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="w-20 h-20 bg-gray-100 dark:bg-white/5 rounded-3xl flex items-center justify-center mb-6 border border-gray-200 dark:border-white/10">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-black mb-2">No assessments yet</h3>
                <p className="text-muted-foreground max-w-sm mb-8 font-medium">
                  Start by generating your first assessment from a curriculum or job description.
                </p>
                <Link href="/assessment">
                  <button className="px-8 py-3 bg-black dark:bg-white text-white dark:text-black rounded-full font-black text-sm hover:opacity-90 transition-all shadow-xl">
                    Get Started
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* Detail Panel */}
          <AnimatePresence>
            {detailId && (
              <motion.div
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className="flex-1 bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-white/10 rounded-3xl overflow-hidden self-start sticky top-8"
              >
                <div className="flex justify-between items-center px-8 py-6 border-b border-gray-100 dark:border-white/5">
                  <div>
                    <h3 className="font-black text-lg">{detailData?.title || "Assessment Detail"}</h3>
                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                      {detailData?.questions?.length || 0} questions
                      {detailData?.course_id && ` · Course #${detailData.course_id}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailData && editingId !== detailData.id && (
                      <button onClick={() => detailData && startEditing({ ...detailData, questions_count: detailData.questions?.length || 0, type: "published" })}
                        className="flex items-center gap-1.5 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-full text-[9px] font-black uppercase tracking-widest hover:opacity-80 transition-all">
                        <Edit3 className="w-3 h-3" /> Edit All
                      </button>
                    )}
                    <button onClick={() => { setDetailId(null); setDetailData(null); setEditingId(null); }}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                <div className="p-8 max-h-[70vh] overflow-y-auto space-y-4">
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (editingId === detailData?.id ? editingQuestions : detailData?.questions || []).map((q, idx) => (
                    <motion.div key={q.id || idx}
                      initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}
                      className="relative bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 rounded-[32px] overflow-hidden group mb-4">
                      
                      {q.status === 'regenerating' && <div className="absolute inset-0 bg-white/80 dark:bg-black/80 z-20 flex flex-col items-center justify-center gap-4 backdrop-blur-sm"><Loader2 className="w-10 h-10 animate-spin text-blue-500"/><p className="font-bold text-[10px] uppercase tracking-widest text-blue-500 animate-pulse">Sensai AI Working...</p></div>}
                      
                      <div className="px-6 py-4 flex flex-wrap gap-3 items-center justify-between border-b border-gray-200 dark:border-white/10 bg-white dark:bg-white/5">
                        <div className="flex gap-2 flex-wrap">
                          <span className="bg-black dark:bg-white text-white dark:text-black px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-tighter">{q.type}</span>
                          <span className={`px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-tighter border ${
                            q.difficulty === "Hard" ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-900/10 dark:text-red-400" :
                            q.difficulty === "Medium" ? "border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-900/10 dark:text-amber-400" :
                            "border-green-300 text-green-600 bg-green-50 dark:bg-green-900/10 dark:text-green-400"
                          }`}>{q.difficulty}</span>
                          <span className="px-3 py-1 text-[9px] font-bold rounded-lg text-muted-foreground border border-gray-200 dark:border-white/10 truncate max-w-[120px]">{q.module}</span>
                        </div>
                        {editingId === detailData?.id && (
                          <div className="flex gap-1">
                            <button onClick={() => setInlineEditingQId(q.id)} className="p-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all">
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleRegenerate(q.id)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500 dark:hover:text-white transition-all" title="Redo Question with AI">
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="p-6">
                        {inlineEditingQId === q.id ? (
                           <div className="space-y-6">
                             <div>
                                <label className="text-[10px] font-black uppercase text-blue-500 tracking-widest block mb-2">Question Text</label>
                                <textarea 
                                  value={q.question_text} 
                                  onChange={(e) => handleUpdateQuestion(q.id, { question_text: e.target.value })}
                                  className="w-full bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-sm font-bold resize-none h-32 outline-none focus:border-blue-500"
                                />
                             </div>

                             {q.options && (
                               <div className="space-y-4">
                                 <label className="text-[10px] font-black uppercase text-blue-500 tracking-widest block">Options & Correct Answer</label>
                                 <div className="space-y-2">
                                   {q.options.map((opt, oidx) => (
                                     <div key={oidx} className="flex items-center gap-3">
                                       <input 
                                         type="radio" name={`correct-${q.id}`} 
                                         checked={q.answer === opt}
                                         onChange={() => handleUpdateQuestion(q.id, { answer: opt })}
                                         className="w-4 h-4 accent-blue-500 cursor-pointer"
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
                                         className="flex-1 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500/50"
                                       />
                                       <button onClick={() => handleDeleteOption(q.id, oidx)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                         <Trash2 className="w-4 h-4" />
                                       </button>
                                     </div>
                                   ))}
                                   <button 
                                     onClick={() => handleAddOption(q.id)}
                                     className="w-full py-3 border border-dashed border-gray-300 dark:border-white/10 rounded-xl text-[10px] font-black text-muted-foreground hover:border-blue-500 hover:text-blue-500 transition-all flex items-center justify-center gap-2"
                                   >
                                     <Plus className="w-3 h-3" /> Add Option
                                   </button>
                                 </div>
                               </div>
                             )}

                             <div>
                                <label className="text-[10px] font-black uppercase text-blue-500 tracking-widest block mb-2">Explanation</label>
                                <textarea 
                                  value={q.explanation} 
                                  onChange={(e) => handleUpdateQuestion(q.id, { explanation: e.target.value })}
                                  className="w-full bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-4 text-xs font-medium italic resize-none h-24 outline-none focus:border-blue-500"
                                />
                             </div>
                             
                             <button 
                               onClick={() => setInlineEditingQId(null)}
                               className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-500/20 text-[10px] uppercase tracking-[0.2em] transform active:scale-95 transition-all"
                             >
                               Finish Editing This Question
                             </button>
                           </div>
                        ) : (
                          <>
                             <div className="group relative">
                               <p className="font-bold text-[15px] leading-relaxed mb-6 selection:bg-blue-500/20">{q.question_text}</p>
                             </div>
                             
                             {q.options && q.options.length > 0 && (
                               <div className="space-y-2 mb-6">
                                 {q.options.map((opt, oidx) => (
                                   <div key={oidx} className={`px-4 py-3 rounded-xl text-xs font-bold transition-all border ${opt === q.answer ? 'bg-blue-500/5 border-blue-500 text-blue-700 dark:text-blue-400' : 'bg-white dark:bg-[#111] border-gray-100 dark:border-white/5'}`}>
                                     <div className="flex items-center gap-3">
                                       <div className={`w-6 h-6 flex items-center justify-center rounded-lg font-black text-[9px] border ${opt === q.answer ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-muted-foreground'}`}>{String.fromCharCode(65 + oidx)}</div>
                                       <span className="flex-1">{opt}</span>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             )}

                             {(!q.options || q.options.length === 0) && (
                               <div className="space-y-2 mb-6">
                                 <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block opacity-80 underline underline-offset-4">Model Answer</span>
                                 <div className="p-4 bg-white dark:bg-black/40 border border-gray-100 dark:border-white/5 rounded-2xl text-[13px] font-bold text-muted-foreground italic leading-relaxed">
                                   {q.answer}
                                 </div>
                               </div>
                             )}

                             <div className="bg-white dark:bg-[#111] p-5 rounded-2xl border border-gray-100 dark:border-white/5">
                               <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5 opacity-80 underline underline-offset-4">Why this answer?</span>
                               <p className="text-xs text-foreground/75 font-medium leading-relaxed italic">{q.explanation}</p>
                             </div>
                          </>
                        )}
                        
                        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-white/5 flex gap-2 flex-wrap">
                           {(q.skills_tested || []).map(sk => <span key={sk} className="text-[8px] font-bold text-muted-foreground border border-gray-200 dark:border-white/10 rounded-full px-2.5 py-0.5 uppercase tracking-tighter">{sk}</span>)}
                           {q.cognitive_level && <span className="text-[8px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5 uppercase tracking-widest">{q.cognitive_level}</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}

                  {editingId === detailData?.id && (
                    <div className="sticky bottom-0 pt-4 flex gap-3 bg-white dark:bg-[#1a1a1a]">
                      <button onClick={() => setEditingId(null)}
                        className="flex-1 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground border border-gray-200 dark:border-white/10 rounded-2xl transition-all">
                        Cancel
                      </button>
                      <button onClick={saveEdit} disabled={isSavingEdit}
                        className="flex-[2] py-3 bg-black dark:bg-white text-white dark:text-black font-black text-[9px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:opacity-90 disabled:opacity-50 transition-all">
                        {isSavingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Publish to Course Modal */}
      <AnimatePresence>
        {publishModal.open && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !isPublishing && setPublishModal({ open: false, assessmentId: null, title: "" })}
              className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white dark:bg-[#111] rounded-[40px] shadow-2xl overflow-hidden border border-gray-100 dark:border-white/10">
              <div className="p-10">
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-14 h-14 bg-blue-600/10 rounded-2xl flex items-center justify-center border border-blue-600/20">
                    <Building className="w-7 h-7 text-blue-500" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black tracking-tight">Publish to Course</h2>
                    <p className="text-sm text-muted-foreground font-medium mt-0.5">"{publishModal.title}"</p>
                  </div>
                  <button onClick={() => setPublishModal({ open: false, assessmentId: null, title: "" })}
                    className="ml-auto p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl transition-all">
                    <X className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {publishSuccess ? (
                  <div className="py-16 flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mb-5 shadow-2xl shadow-emerald-500/40">
                      <CheckCircle className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-black uppercase mb-2">Published!</h3>
                    <p className="text-muted-foreground font-medium">Assessment is now live in <b>{selectedCourse?.name}</b></p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {loadingCourses ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : courses.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No courses available.</p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground block mb-3">Select Course</label>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {courses.map(c => (
                              <button key={c.id} onClick={() => { setSelectedCourse(c); setSelectedMilestone(null); }}
                                className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between transition-all ${
                                  selectedCourse?.id === c.id ? "bg-blue-500/10 border-blue-500" : "bg-gray-50 dark:bg-white/5 border-gray-100 dark:border-white/10 hover:border-gray-200"
                                }`}>
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-xl ${selectedCourse?.id === c.id ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-white/10"}`}>
                                    <BookOpen className="w-4 h-4" />
                                  </div>
                                  <span className="font-bold text-sm">{c.name}</span>
                                </div>
                                {selectedCourse?.id === c.id && <CheckCircle className="w-4 h-4 text-blue-500" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        <AnimatePresence>
                          {selectedCourse && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                              <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground block mb-3">Select Milestone</label>
                              {selectedCourse.milestones.length === 0 ? (
                                <p className="text-xs text-muted-foreground font-medium">No milestones in this course.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {selectedCourse.milestones.map(m => (
                                    <button key={m.id} onClick={() => setSelectedMilestone(m)}
                                      className={`px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all ${
                                        selectedMilestone?.id === m.id ? "bg-blue-600 text-white border-blue-600" : "bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-muted-foreground hover:border-gray-300"
                                      }`}>
                                      {m.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setPublishModal({ open: false, assessmentId: null, title: "" })} disabled={isPublishing}
                        className="flex-1 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                        Cancel
                      </button>
                      <button onClick={handlePublishToCourse}
                        disabled={isPublishing || !selectedCourse || !selectedMilestone}
                        className="flex-[2] bg-blue-600 text-white py-3 rounded-2xl flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-widest shadow-xl shadow-blue-600/30 disabled:opacity-30 hover:opacity-90 active:scale-95 transition-all">
                        {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building className="w-4 h-4" />}
                        Confirm & Publish
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {feedbackModal.isOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
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
                <div className="p-3 bg-blue-500/10 rounded-2xl"><MessageSquare className="w-5 h-5 text-blue-500" /></div>
                <div>
                   <h3 className="text-sm font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">{feedbackModal.type === "full" ? "Improve Question" : "Fix Segment"}</h3>
                   <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight">Tell Sensai AI how to polish this for you</p>
                </div>
              </div>

              <div className="p-8">
                 {feedbackModal.type === "segment" && (
                   <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-500 block mb-2 opacity-60">Targeting Segment:</span>
                      <p className="text-xs font-bold italic">"{feedbackModal.segment}"</p>
                   </div>
                 )}
                 <textarea 
                    autoFocus
                    placeholder="e.g., Make it more conceptual, change technical focus, or fix a typo..."
                    className="w-full h-32 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-2xl p-5 text-sm font-medium resize-none outline-none focus:border-blue-500 transition-all shadow-inner"
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
                      className="flex-1 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={executeRegeneration}
                      disabled={!feedbackModal.feedback.trim()}
                      className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-500/20 text-[10px] uppercase tracking-[0.2em] transform active:scale-95 transition-all disabled:opacity-50 flex flex-col items-center justify-center leading-none"
                    >
                      <span className="flex items-center justify-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Regenerate</span>
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm !== null && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#111] rounded-[32px] shadow-2xl border border-gray-100 dark:border-white/10 p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-xl font-black mb-2">Delete Assessment?</h3>
              <p className="text-muted-foreground font-medium text-sm mb-8">This action cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 dark:hover:bg-white/5 rounded-2xl transition-all">
                  Cancel
                </button>
                <button onClick={() => deleteAssessment(deleteConfirm)}
                  className="flex-[2] bg-red-500 text-white py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:opacity-90 active:scale-95 transition-all">
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Alert Dialog */}
      <AnimatePresence>
        {dialog.isOpen && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-black/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white dark:bg-[#111] rounded-[32px] overflow-hidden shadow-2xl border border-gray-100 dark:border-white/10 p-8 text-center">
              <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-xl font-black mb-3">{dialog.title}</h3>
              <p className="text-muted-foreground font-medium text-sm mb-8">{dialog.message}</p>
              <button 
                onClick={() => setDialog(prev => ({ ...prev, isOpen: false }))}
                className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:opacity-90 active:scale-95 transition-all"
              >
                Understood
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

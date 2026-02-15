import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, Upload, BookOpen, PieChart, Plus, ChevronRight, Save, Trash2, RefreshCw, CheckCircle, XCircle, FileText, Brain, PenTool, Search, Lightbulb, Calendar, ArrowRight, Star, AlertCircle, Filter, Clock, RotateCcw } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

// --- Types & Constants ---

type QuestionCategory =
  | '言语理解与表达'
  | '数量关系'
  | '判断推理'
  | '资料分析'
  | '常识判断'
  | '综合应用-案例分析'
  | '综合应用-文书写作'
  | '其他';

type MasteryStatus = 'mastered' | 'review_needed' | null;

interface Question {
  id: string;
  imageUrl: string;
  subject: '职测' | '综应';
  category: QuestionCategory;
  subCategory: string; // e.g., "逻辑填空", "图形推理"
  questionText: string; // Extracted text for search
  aiAnalysis: string; // AI's initial take
  myThinking: string; // User's wrong thought process
  correctResolution: string; // Correct answer and logic
  rootCause?: string; // Deep analysis of why the user got it wrong
  masteryStatus?: MasteryStatus; // New field for mastery tracking
  createdAt: number;
  reviewCount: number;
  lastReviewedAt: number | null;
}

const CATEGORIES: { [key: string]: QuestionCategory[] } = {
  '职测': ['言语理解与表达', '数量关系', '判断推理', '资料分析', '常识判断'],
  '综应': ['综合应用-案例分析', '综合应用-文书写作'],
};

// --- Mock Data / Storage Helper ---

const STORAGE_KEY = 'sd_exam_wrong_questions_v1';

const saveQuestions = (questions: Question[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
};

const loadQuestions = (): Question[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

// --- Helpers ---

const getPeriodKey = (ts: number) => {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const part = day <= 15 ? '上半月' : '下半月';
  return `${year}年${month}月${part}`;
};

const formatDate = (ts: number) => {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

// --- Components ---

// 1. Tab Navigation
const TabNav = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => (
  <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around py-3 z-50 safe-area-pb">
    <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center ${activeTab === 'dashboard' ? 'text-blue-600' : 'text-gray-400'}`}>
      <PieChart size={24} />
      <span className="text-xs mt-1">概览</span>
    </button>
    <button onClick={() => setActiveTab('add')} className={`flex flex-col items-center ${activeTab === 'add' ? 'text-blue-600' : 'text-gray-400'}`}>
      <div className="bg-blue-600 text-white p-3 rounded-full -mt-6 shadow-lg">
        <Plus size={24} />
      </div>
      <span className="text-xs mt-1">录入</span>
    </button>
    <button onClick={() => setActiveTab('review')} className={`flex flex-col items-center ${activeTab === 'review' ? 'text-blue-600' : 'text-gray-400'}`}>
      <BookOpen size={24} />
      <span className="text-xs mt-1">复盘</span>
    </button>
  </div>
);

// 2. Dashboard View
const Dashboard = ({ questions }: { questions: Question[] }) => {
  const total = questions.length;
  const priorityCount = questions.filter(q => q.masteryStatus === 'review_needed').length;
  
  // Calculate category stats
  const catStats: Record<string, number> = {};
  questions.forEach(q => {
    catStats[q.category] = (catStats[q.category] || 0) + 1;
  });

  return (
    <div className="p-6 pb-24">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">错题复盘助手</h1>
        <p className="text-gray-500 text-sm">山东事业编统考专属</p>
      </header>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
          <p className="text-blue-600 text-sm font-medium">累计错题</p>
          <p className="text-3xl font-bold text-gray-800 mt-2">{total}</p>
        </div>
        <div className="bg-red-50 p-4 rounded-2xl border border-red-100 relative overflow-hidden">
          <div className="absolute top-2 right-2 opacity-10 text-red-500">
            <AlertCircle size={48} />
          </div>
          <p className="text-red-600 text-sm font-medium">重点复习</p>
          <p className="text-3xl font-bold text-gray-800 mt-2">{priorityCount}</p>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-800 mb-4">题型分布</h2>
      <div className="space-y-3">
        {Object.entries(catStats).map(([cat, count]) => (
          <div key={cat} className="flex items-center">
            <div className="w-32 text-sm text-gray-600 truncate">{cat}</div>
            <div className="flex-1 h-2 bg-gray-100 rounded-full mx-3 overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full" 
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
            <div className="text-sm font-medium text-gray-700">{count}题</div>
          </div>
        ))}
        {total === 0 && <p className="text-gray-400 text-sm italic">暂无错题数据，请点击下方 + 号录入。</p>}
      </div>
    </div>
  );
};

// 3. Add Question View (AI Powered)
const AddQuestion = ({ onSave, onCancel }: { onSave: (q: Question) => void, onCancel: () => void }) => {
  const [image, setImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false); // State for second pass analysis
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  // Form State
  const [subject, setSubject] = useState<'职测' | '综应'>('职测');
  const [category, setCategory] = useState<QuestionCategory>('言语理解与表达');
  const [subCategory, setSubCategory] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [myThinking, setMyThinking] = useState('');
  const [correctResolution, setCorrectResolution] = useState('');
  const [rootCause, setRootCause] = useState('');
  // Default to review_needed for new wrong questions if root cause is analyzed
  const [tempMastery, setTempMastery] = useState<MasteryStatus>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setImage(base64);
      analyzeImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (base64Image: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");

      const ai = new GoogleGenAI({ apiKey });
      const base64Data = base64Image.split(',')[1];
      
      const prompt = `
        你是一个山东事业编统考（职测/综应）的辅导专家。请分析这张错题截图。
        
        请返回一个纯JSON格式的回答，不要包含markdown标记。JSON字段如下：
        {
          "subject": "职测" 或 "综应",
          "category": "属于哪个大类（例如：言语理解与表达, 数量关系, 判断推理, 资料分析, 常识判断, 综合应用-案例分析, 综合应用-文书写作）",
          "subCategory": "细分题型（例如：主旨概括, 逻辑填空, 图形推理, 增长率计算等）",
          "questionText": "提取题干主要文字",
          "analysis": "分析题目的考点、难点，以及容易做错的陷阱。",
          "solution": "详细的正确解析思路。"
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
            { text: prompt }
          ]
        }
      });

      const text = response.text || '';
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const data = JSON.parse(jsonStr);
        setSubject(data.subject === '综应' ? '综应' : '职测');
        const validCategories = [...CATEGORIES['职测'], ...CATEGORIES['综应']];
        if (validCategories.includes(data.category)) {
           setCategory(data.category as QuestionCategory);
        }
        setSubCategory(data.subCategory || '');
        setAiAnalysis(data.analysis || '');
        setCorrectResolution(data.solution || '');
      } catch (e) {
        console.error("Failed to parse JSON", e);
        setAiAnalysis(text);
      }

    } catch (err) {
      console.error(err);
      setAnalysisError("AI分析失败，请手动输入。");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // New Function: Deep Analysis based on user thinking
  const handleDeepAnalysis = async () => {
    if (!myThinking && !correctResolution) {
      setAnalysisError("请先输入‘我的做题思路’或‘正确解析’，AI才能分析深层错因。");
      return;
    }

    setIsDeepAnalyzing(true);
    setAnalysisError(null);

    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) throw new Error("API Key missing");

      const ai = new GoogleGenAI({ apiKey });
      
      const prompt = `
        你是一名顶级公考辅导专家（山东事业编统考方向）。请根据学员提供的【学员思路】与【正确解析】进行差异对比，精准诊断痛点。

        【基本信息】
        科目：${subject}
        大类：${category}
        细分题型：${subCategory}

        【学员思路】
        ${myThinking || "（学员未提供详细思路，请基于该题型的常见误区进行推断，分析学员可能的思维路径）"}

        【正确解析】
        ${correctResolution || "（请结合图片内容自行推导正确逻辑）"}

        请返回纯JSON格式，确保字段内容详实、具体、有针对性：
        {
          "analysis": "请具体指出学员的思维误区。不要泛泛而谈。例如：指出具体的逻辑谬误（如‘偷换概念’）、知识盲区（如‘混淆增长率与增长量’）或解题习惯问题（如‘未看完选项即作答’）。必须包含‘学员错在...而正确逻辑是...’的对比。",
          "refinedSubCategory": "更精准的考点标签（例如：将‘逻辑填空’细化为‘逻辑填空-对应关系-解释说明’）。若当前标签已足够精准，返回空字符串。",
          "suggestion": "极具操作性的行动指南。拒绝‘多做题’等废话。例如：‘建议整理[主体不一致]的错题集’、‘每天默写一次[资料分析速算公式]’、‘对比A选项和B选项的细微差别，注意[限定词]的陷阱’。"
        }
      `;

      // Include image context if available
      let reqContent;
      if (image) {
         const base64Data = image.split(',')[1];
         reqContent = {
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
              { text: prompt }
            ]
         };
      } else {
         reqContent = {
            parts: [{ text: prompt }]
         };
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: reqContent
      });

      const text = response.text || '';
      const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const data = JSON.parse(jsonStr);

      if (data.analysis) {
        const fullAnalysis = data.suggestion 
          ? `${data.analysis}\n\n💡 🚀 改进方案：${data.suggestion}` 
          : data.analysis;
        setRootCause(fullAnalysis);
        // Automatically suggest "Review Needed" when analysis is complete
        setTempMastery('review_needed');
      }
      if (data.refinedSubCategory) {
        setSubCategory(data.refinedSubCategory);
      }

    } catch (e) {
      console.error(e);
      setAnalysisError("深度分析失败，请稍后重试。");
    } finally {
      setIsDeepAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (!image) return;
    const newQ: Question = {
      id: Date.now().toString(),
      imageUrl: image,
      subject,
      category,
      subCategory,
      questionText: 'Image Question',
      aiAnalysis,
      myThinking,
      correctResolution,
      rootCause, // Save the deep analysis
      masteryStatus: tempMastery,
      createdAt: Date.now(),
      reviewCount: 0,
      lastReviewedAt: null,
    };
    onSave(newQ);
  };

  if (!image) {
    return (
      <div className="p-6 flex flex-col items-center justify-center h-full pb-24">
        <h2 className="text-xl font-bold mb-8">录入错题</h2>
        <label className="w-64 h-64 border-2 border-dashed border-blue-300 rounded-3xl flex flex-col items-center justify-center bg-blue-50 cursor-pointer hover:bg-blue-100 transition-colors">
          <Camera size={48} className="text-blue-500 mb-4" />
          <span className="text-blue-600 font-medium">拍照 / 上传截图</span>
          <span className="text-blue-400 text-xs mt-2">支持AI自动识别分类</span>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto pb-24">
      <div className="sticky top-0 bg-white border-b z-10 px-4 py-3 flex justify-between items-center shadow-sm">
        <button onClick={() => setImage(null)} className="text-gray-500 text-sm">重新上传</button>
        <span className="font-bold text-gray-800">编辑错题详情</span>
        <button 
          onClick={handleSave} 
          className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-1"
        >
          <Save size={14} /> 保存
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Image Preview */}
        <div className="bg-white p-2 rounded-xl border shadow-sm">
           <img src={image} alt="Wrong Question" className="w-full h-auto rounded-lg max-h-60 object-contain bg-black" />
        </div>

        {/* AI Status */}
        {isAnalyzing && (
          <div className="bg-blue-50 text-blue-700 p-3 rounded-lg flex items-center gap-2 text-sm animate-pulse">
            <Brain size={16} /> AI正在分析题型和考点...
          </div>
        )}
        {analysisError && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
            {analysisError}
          </div>
        )}

        {/* Classification */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-4">
          <div className="flex items-center gap-2 mb-2">
             <FileText size={18} className="text-blue-600"/>
             <h3 className="font-bold text-gray-800">题型归类</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">科目</label>
              <select 
                value={subject} 
                onChange={e => {
                  setSubject(e.target.value as any);
                  setCategory(CATEGORIES[e.target.value as any][0]);
                }}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm"
              >
                <option value="职测">职测</option>
                <option value="综应">综应</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">大类</label>
              <select 
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm"
              >
                {CATEGORIES[subject].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">细分题型 (AI识别)</label>
            <input 
              type="text" 
              value={subCategory}
              onChange={e => setSubCategory(e.target.value)}
              placeholder="例如：逻辑填空-成语辨析"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg p-2 text-sm"
            />
          </div>
        </div>

        {/* User Thinking */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-2">
          <div className="flex items-center gap-2">
             <PenTool size={18} className="text-orange-500"/>
             <h3 className="font-bold text-gray-800">我的做题思路</h3>
          </div>
          <p className="text-xs text-gray-400">当时是怎么想的？为什么选错了？</p>
          <textarea 
            value={myThinking}
            onChange={e => setMyThinking(e.target.value)}
            className="w-full h-24 bg-orange-50 border border-orange-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-orange-200 outline-none"
            placeholder="请在此输入你当时的思路，AI将帮助你分析错误根源..."
          />
        </div>

        {/* Correct Resolution */}
        <div className="bg-white p-4 rounded-xl shadow-sm border space-y-2">
          <div className="flex items-center gap-2">
             <CheckCircle size={18} className="text-green-600"/>
             <h3 className="font-bold text-gray-800">答案解析</h3>
          </div>
          <textarea 
            value={correctResolution}
            onChange={e => setCorrectResolution(e.target.value)}
            placeholder="输入正确答案和解析..."
            className="w-full h-32 bg-green-50 border border-green-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-green-200 outline-none"
          />
        </div>

        {/* Deep Analysis Action */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleDeepAnalysis}
            disabled={isDeepAnalyzing || (!myThinking && !correctResolution)}
            className={`w-full py-3 rounded-xl font-bold text-white shadow-md flex items-center justify-center gap-2 transition-all ${
              !myThinking && !correctResolution ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'
            }`}
          >
            {isDeepAnalyzing ? (
              <>
                 <RefreshCw size={18} className="animate-spin" /> 深度诊断中...
              </>
            ) : (
              <>
                <Brain size={18} /> AI 深度归因分析
              </>
            )}
          </button>
          
          {(!myThinking && !correctResolution) && (
             <p className="text-xs text-center text-gray-400">请先补充“做题思路”或“正确解析”，让AI为你精准把脉。</p>
          )}

          {/* Root Cause Result */}
          {rootCause && (
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-4 animate-fade-in relative">
               <div className="flex items-center gap-2 text-indigo-800">
                 <Lightbulb size={18} />
                 <h3 className="font-bold">AI 错因诊断报告</h3>
               </div>
               <textarea 
                 value={rootCause}
                 onChange={e => setRootCause(e.target.value)}
                 className="w-full h-32 bg-transparent border-none text-sm text-gray-700 focus:ring-0 resize-none"
               />
               
               {/* Mastery Actions in Analysis Report */}
               <div className="flex gap-2 pt-2 border-t border-indigo-100">
                 <button 
                   onClick={() => setTempMastery('review_needed')}
                   className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                     tempMastery === 'review_needed' 
                       ? 'bg-red-50 border-red-200 text-red-600' 
                       : 'bg-white border-transparent text-gray-400 hover:bg-gray-50'
                   }`}
                 >
                   <AlertCircle size={14} /> 需加强 (重点复习)
                 </button>
                 <button 
                   onClick={() => setTempMastery('mastered')}
                   className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                     tempMastery === 'mastered' 
                       ? 'bg-green-50 border-green-200 text-green-600' 
                       : 'bg-white border-transparent text-gray-400 hover:bg-gray-50'
                   }`}
                 >
                   <CheckCircle size={14} /> 已掌握
                 </button>
               </div>
               <p className="text-xs text-indigo-400 italic text-center mt-1">标记为“需加强”将自动加入复习提醒列表</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

// 4. Review / Exam Mode
const ReviewMode = ({ questions, onUpdateQuestion }: { questions: Question[], onUpdateQuestion: (q: Question) => void }) => {
  const [mode, setMode] = useState<'list' | 'exam'>('list');
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [currentExamIndex, setCurrentExamIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [examTitle, setExamTitle] = useState("错题组卷");
  const [filterMode, setFilterMode] = useState<'all' | 'priority'>('all');

  const startRandomExam = () => {
    // If filter is priority, only pick from priority
    let pool = questions;
    if (filterMode === 'priority') {
      pool = questions.filter(q => q.masteryStatus === 'review_needed');
    }
    if (pool.length === 0) {
      alert("当前列表没有题目可考！");
      return;
    }
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    setExamQuestions(shuffled);
    setCurrentExamIndex(0);
    setShowAnswer(false);
    setExamTitle(filterMode === 'priority' ? "重点题目突击" : "随机巩固练习");
    setMode('exam');
  };

  const startPeriodExam = (periodKey: string, periodQuestions: Question[]) => {
    // Keep original order or shuffle slightly? Let's shuffle for exam feel.
    const shuffled = [...periodQuestions].sort(() => 0.5 - Math.random());
    setExamQuestions(shuffled);
    setCurrentExamIndex(0);
    setShowAnswer(false);
    setExamTitle(`${periodKey} 模拟考试`);
    setMode('exam');
  };

  const handleUpdateMastery = (q: Question, status: MasteryStatus) => {
    const updatedQ = { ...q, masteryStatus: status };
    // Update local exam state
    const newExamQs = [...examQuestions];
    newExamQs[currentExamIndex] = updatedQ;
    setExamQuestions(newExamQs);
    // Propagate up
    onUpdateQuestion(updatedQ);
  };

  const handleNext = () => {
    // Increment review stats when proceeding from a question
    const currentQ = examQuestions[currentExamIndex];
    const updatedQ = {
      ...currentQ,
      reviewCount: (currentQ.reviewCount || 0) + 1,
      lastReviewedAt: Date.now()
    };
    
    // Update Global
    onUpdateQuestion(updatedQ);
    
    // Update Local to keep consistency if we stay in exam mode
    const newExamQs = [...examQuestions];
    newExamQs[currentExamIndex] = updatedQ;
    setExamQuestions(newExamQs);

    if (currentExamIndex < examQuestions.length - 1) {
      setCurrentExamIndex(currentExamIndex + 1);
      setShowAnswer(false);
    } else {
      alert("本轮考试结束！");
      setMode('list');
    }
  };

  // Group questions by period
  const periodGroups: { [key: string]: Question[] } = {};
  questions.forEach(q => {
    const key = getPeriodKey(q.createdAt);
    if (!periodGroups[key]) periodGroups[key] = [];
    periodGroups[key].push(q);
  });

  // Sort periods reverse chronologically
  const periods = Object.keys(periodGroups).sort((a, b) => {
    // quick parse key: "2023年10月上半月"
    const parse = (k: string) => {
      const parts = k.match(/(\d+)年(\d+)月(.+)/);
      if (!parts) return 0;
      const y = parseInt(parts[1]);
      const m = parseInt(parts[2]);
      const p = parts[3] === '上半月' ? 0 : 1;
      return y * 1000 + m * 10 + p;
    };
    return parse(b) - parse(a);
  });

  const filteredList = filterMode === 'priority' 
    ? questions.filter(q => q.masteryStatus === 'review_needed') 
    : questions;

  if (mode === 'exam' && examQuestions.length > 0) {
    const q = examQuestions[currentExamIndex];
    return (
      <div className="flex flex-col h-full bg-white pb-20">
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center shadow-md">
           <button onClick={() => setMode('list')} className="text-blue-100 text-sm">退出</button>
           <div className="flex flex-col items-center">
             <span className="font-bold text-sm">{examTitle}</span>
             <span className="text-xs opacity-80">({currentExamIndex + 1}/{examQuestions.length})</span>
           </div>
           <span className="text-xs bg-blue-700 px-2 py-1 rounded">{q.category}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
           {/* Question Image Area */}
           <div className="mb-6">
             <img src={q.imageUrl} className="w-full rounded-lg border border-gray-200" />
           </div>

           {!showAnswer ? (
             <div className="text-center mt-8">
               <button 
                onClick={() => setShowAnswer(true)}
                className="bg-blue-50 text-blue-600 px-6 py-3 rounded-full font-medium shadow-sm active:scale-95 transition-transform"
               >
                 查看解析
               </button>
             </div>
           ) : (
             <div className="space-y-6 animate-fade-in">
               <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                 <h4 className="font-bold text-orange-800 mb-2 text-sm">你的历史错因</h4>
                 <p className="text-gray-700 text-sm">{q.myThinking || "暂无记录"}</p>
               </div>
               
               {q.rootCause && (
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <div className="flex items-center gap-2 mb-2 justify-between">
                       <div className="flex items-center gap-2">
                         <Brain size={16} className="text-indigo-600"/>
                         <h4 className="font-bold text-indigo-800 text-sm">深度诊断</h4>
                       </div>
                    </div>
                    <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed mb-4">{q.rootCause}</p>

                    {/* Mastery Toggle in Exam Mode */}
                    <div className="flex gap-2 pt-2 border-t border-indigo-200/50">
                        <button 
                          onClick={() => handleUpdateMastery(q, 'review_needed')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                            q.masteryStatus === 'review_needed' 
                              ? 'bg-red-100 border-red-300 text-red-700 shadow-sm' 
                              : 'bg-white/50 border-transparent text-gray-500 hover:bg-white'
                          }`}
                        >
                          <AlertCircle size={14} /> 需加强
                        </button>
                        <button 
                          onClick={() => handleUpdateMastery(q, 'mastered')}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-colors ${
                            q.masteryStatus === 'mastered' 
                              ? 'bg-green-100 border-green-300 text-green-700 shadow-sm' 
                              : 'bg-white/50 border-transparent text-gray-500 hover:bg-white'
                          }`}
                        >
                          <CheckCircle size={14} /> 已掌握
                        </button>
                    </div>
                  </div>
               )}

               <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                 <h4 className="font-bold text-green-800 mb-2 text-sm">正确解析</h4>
                 <p className="text-gray-700 text-sm whitespace-pre-wrap">{q.correctResolution || q.aiAnalysis}</p>
               </div>
             </div>
           )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
           <button 
             disabled={currentExamIndex === 0}
             onClick={() => {
               setCurrentExamIndex(Math.max(0, currentExamIndex - 1));
               setShowAnswer(false);
             }}
             className="text-gray-600 disabled:opacity-30"
           >
             上一题
           </button>
           
           <button 
             onClick={handleNext}
             className="bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg"
           >
             {currentExamIndex < examQuestions.length - 1 ? '下一题' : '完成'}
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pb-24 h-full overflow-y-auto bg-gray-50">
      <header className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">复盘 & 模考</h1>
        <button 
          onClick={startRandomExam}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2 active:bg-gray-100 border ${
            filterMode === 'priority' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          <RefreshCw size={14} /> {filterMode === 'priority' ? '突击重点' : '随机练习'}
        </button>
      </header>
      
      {/* Regular Exam Section - Only show in All mode */}
      {filterMode === 'all' && periods.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
             <Calendar size={18} className="text-blue-600" />
             <h2 className="font-bold text-gray-800">定期模考 (自动生成)</h2>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 snap-x">
             {periods.map(period => {
               const count = periodGroups[period].length;
               return (
                 <div key={period} className="flex-shrink-0 w-64 snap-start bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl p-4 text-white shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                       <FileText size={64} />
                    </div>
                    <p className="text-blue-100 text-xs font-medium mb-1">半月错题集训</p>
                    <h3 className="text-xl font-bold mb-4">{period}</h3>
                    
                    <div className="flex justify-between items-end">
                       <div>
                          <p className="text-2xl font-bold">{count}</p>
                          <p className="text-xs text-blue-200">待重做题目</p>
                       </div>
                       <button 
                         onClick={() => startPeriodExam(period, periodGroups[period])}
                         className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform"
                       >
                         开始考试 <ArrowRight size={12} />
                       </button>
                    </div>
                 </div>
               );
             })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-4 mb-4 border-b border-gray-200 pb-2">
         <button 
           onClick={() => setFilterMode('all')}
           className={`text-sm font-bold pb-1 relative ${filterMode === 'all' ? 'text-gray-800' : 'text-gray-400'}`}
         >
           全部题目
           {filterMode === 'all' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-full" />}
         </button>
         <button 
           onClick={() => setFilterMode('priority')}
           className={`text-sm font-bold pb-1 relative flex items-center gap-1 ${filterMode === 'priority' ? 'text-red-600' : 'text-gray-400'}`}
         >
           重点复习 (需加强)
           {filterMode === 'priority' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-full" />}
           <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full text-[10px]">
             {questions.filter(q => q.masteryStatus === 'review_needed').length}
           </span>
         </button>
      </div>

      {filteredList.length === 0 ? (
        <div className="text-center text-gray-400 mt-10">
          <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
          <p>{filterMode === 'priority' ? '太棒了！暂无需要重点复习的题目' : '还没有录入任何错题'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredList.map((q) => (
            <div key={q.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 relative">
              <img src={q.imageUrl} className="w-20 h-20 object-cover rounded-lg bg-gray-100 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                   <div className="flex gap-1 flex-wrap">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{q.category}</span>
                      {q.rootCause && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">已诊断</span>}
                   </div>
                   
                   {/* Display Last Reviewed At if available, otherwise creation date */}
                   <span className="text-xs text-gray-400 flex items-center gap-1">
                     {q.lastReviewedAt ? (
                       <>
                         <Clock size={10} /> 上次: {formatDate(q.lastReviewedAt)}
                       </>
                     ) : (
                       <span>录入: {formatDate(q.createdAt)}</span>
                     )}
                   </span>
                </div>
                
                <h3 className="font-bold text-gray-800 mt-2 truncate text-sm">{q.subCategory || "未分类题型"}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{q.correctResolution ? q.correctResolution.substring(0, 50) + "..." : "暂无解析"}</p>
                
                {/* Stats Footer in List Card */}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400 border-t border-gray-50 pt-2">
                   <div className="flex items-center gap-1">
                      <RotateCcw size={10} />
                      <span>复盘 {q.reviewCount || 0} 次</span>
                   </div>
                   {q.masteryStatus === 'mastered' && (
                     <span className="text-green-600 font-medium">已掌握</span>
                   )}
                   {q.masteryStatus === 'review_needed' && (
                     <span className="text-red-500 font-medium">需加强</span>
                   )}
                </div>
              </div>
              
              {/* Mastery Indicator Icon */}
              {q.masteryStatus === 'review_needed' && (
                <div className="absolute top-4 right-4 text-red-500 bg-red-50 p-1.5 rounded-full shadow-sm" title="需加强">
                  <AlertCircle size={14} />
                </div>
              )}
              {q.masteryStatus === 'mastered' && (
                <div className="absolute top-4 right-4 text-green-500 bg-green-50 p-1.5 rounded-full shadow-sm" title="已掌握">
                  <CheckCircle size={14} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Main App Container ---

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    setQuestions(loadQuestions());
  }, []);

  const handleSaveQuestion = (q: Question) => {
    const updated = [q, ...questions];
    setQuestions(updated);
    saveQuestions(updated);
    setActiveTab('review');
  };

  const handleUpdateQuestion = (q: Question) => {
    const updated = questions.map(item => item.id === q.id ? q : item);
    setQuestions(updated);
    saveQuestions(updated);
  };

  return (
    <div className="bg-gray-50 min-h-screen text-gray-900 font-sans">
      <main className="h-screen overflow-hidden">
        {activeTab === 'dashboard' && <Dashboard questions={questions} />}
        {activeTab === 'add' && (
          <AddQuestion 
            onSave={handleSaveQuestion} 
            onCancel={() => setActiveTab('dashboard')} 
          />
        )}
        {activeTab === 'review' && <ReviewMode questions={questions} onUpdateQuestion={handleUpdateQuestion} />}
      </main>
      <TabNav activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  );
};

const root = createRoot(document.getElementById('app')!);
root.render(<App />);
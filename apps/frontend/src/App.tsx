import { useState, useEffect } from "react";
import {
  Trophy,
  Users,
  FileSpreadsheet,
  RefreshCw,
  Plus,
  TrendingUp,
  Calendar,
  CheckCircle2,
  FileText,
  Upload,
  Edit2,
  X,
} from "lucide-react";
import { api } from "./services/api";

export function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "tournaments" | "players" | "imports">("dashboard");
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [players, setPlayers] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [matchScorecard, setMatchScorecard] = useState<any>(null);
  const [activeInningsTab, setActiveInningsTab] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  // PDF / Image Scorecard Verification Workflow State
  const [importStep, setImportStep] = useState<"UPLOAD" | "VERIFY_EDIT" | "SUCCESS">("UPLOAD");
  const [parsedScorecard, setParsedScorecard] = useState<any>(null);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Player Registration Modal State
  const [isRegisteringPlayer, setIsRegisteringPlayer] = useState<boolean>(false);
  const [newPlayerForm, setNewPlayerForm] = useState({
    name: "",
    displayName: "",
    photoUrl: "",
    primaryRole: "BATTER",
    battingStyle: "RIGHT_HAND",
    bowlingStyle: "NONE",
  });

  // Player Edit State
  const [editingPlayer, setEditingPlayer] = useState<any | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [dashRes, tourRes, playRes, matRes] = await Promise.allSettled([
        api.get("/analytics/dashboard"),
        api.get("/tournaments"),
        api.get("/players"),
        api.get("/matches"),
      ]);

      if (dashRes.status === "fulfilled") setDashboardData(dashRes.value.data);
      if (tourRes.status === "fulfilled") setTournaments(tourRes.value.data.tournaments || []);
      if (playRes.status === "fulfilled") setPlayers(playRes.value.data.players || []);
      if (matRes.status === "fulfilled") {
        const fetchedMatches = matRes.value.data.matches || [];
        setMatches(fetchedMatches);
        if (fetchedMatches.length > 0 && !selectedMatchId) {
          loadMatchScorecard(fetchedMatches[0].id);
        } else if (fetchedMatches.length === 0) {
          setSelectedMatchId(null);
          setMatchScorecard(null);
        }
      }
    } catch (e) {
      console.error("Error loading application data", e);
    } finally {
      setLoading(false);
    }
  };

  const loadMatchScorecard = async (matchId: string) => {
    setSelectedMatchId(matchId);
    try {
      const res = await api.get(`/analytics/matches/${matchId}/scorecard`);
      setMatchScorecard(res.data);
    } catch (e) {
      console.warn("Could not load dynamic scorecard for match", matchId, e);
    }
  };

  // Upload PDF or Long Image to extract raw fields
  const handleDocumentUpload = async (file: File) => {
    setIsUploading(true);
    setUploadFileName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post("/imports/document-preview", fd);
      setParsedScorecard(res.data.parsedData);
      setImportStep("VERIFY_EDIT");
    } catch (e: any) {
      alert("Document parse error: " + (e.response?.data?.error || e.message));
    } finally {
      setIsUploading(false);
    }
  };

  // Client confirms & updates fields, then commits match to backend
  const handleConfirmAndCommitScorecard = async () => {
    if (!parsedScorecard) return;
    setLoading(true);
    try {
      await api.post("/imports/document-commit", parsedScorecard);
      setImportStep("SUCCESS");
      await loadAllData();
    } catch (e: any) {
      alert("Error committing match: " + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  // Handle Player Registration with Photo and Auto ID
  const handleCreatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerForm.name) return;
    try {
      await api.post("/players", newPlayerForm);
      setIsRegisteringPlayer(false);
      setNewPlayerForm({
        name: "",
        displayName: "",
        photoUrl: "",
        primaryRole: "BATTER",
        battingStyle: "RIGHT_HAND",
        bowlingStyle: "NONE",
      });
      await loadAllData();
    } catch (err: any) {
      alert("Error registering player: " + (err.response?.data?.error || err.message));
    }
  };

  // Handle Player Edit and Update
  const handleUpdatePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayer || !editingPlayer.name) return;
    try {
      await api.put(`/players/${editingPlayer.id}`, {
        name: editingPlayer.name,
        displayName: editingPlayer.displayName,
        photoUrl: editingPlayer.photoUrl,
        primaryRole: editingPlayer.primaryRole,
        battingStyle: editingPlayer.battingStyle,
        bowlingStyle: editingPlayer.bowlingStyle,
      });
      setEditingPlayer(null);
      await loadAllData();
    } catch (err: any) {
      alert("Error updating player: " + (err.response?.data?.error || err.message));
    }
  };

  const currentInnings = matchScorecard?.scorecard?.innings?.[activeInningsTab];

  return (
    <div className="flex h-screen bg-[#0b132b] text-slate-100 font-sans">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#111c44] border-r border-slate-800 flex flex-col justify-between">
        <div>
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white">CrickView</h1>
              <p className="text-xs text-emerald-400 font-semibold">Tournament Analytics</p>
            </div>
          </div>

          <nav className="p-4 space-y-1.5">
            {[
              { id: "dashboard", label: "Dashboard", icon: TrendingUp },
              { id: "tournaments", label: "Tournaments", icon: Trophy },
              { id: "players", label: "Players", icon: Users },
              { id: "imports", label: "Imports", icon: FileSpreadsheet },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
          <span>Backend Connected</span>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]"></span>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white capitalize">
              {activeTab}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Production Cricket Tournament Platform: PDF/Image Ingestion, Verification & Unique ID Roster.
            </p>
          </div>
          <button
            onClick={loadAllData}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center space-x-2 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync API</span>
          </button>
        </header>

        {/* ===================== DASHBOARD VIEW ===================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { label: "Tournaments", val: dashboardData?.summary?.tournamentsCount ?? tournaments.length, sub: "Configured formats" },
                { label: "Registered Players", val: dashboardData?.summary?.playersCount ?? players.length, sub: "Auto unique ID roster" },
                { label: "Matches Completed", val: dashboardData?.summary?.matchesCompleted ?? matches.length, sub: "Validated match scorecards" },
                { label: "Importer Engine", val: "PDF / Image", sub: "Two-step verification flow" },
              ].map((stat, i) => (
                <div key={i} className="bg-[#1c2541]/90 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</span>
                  <div className="text-3xl font-black text-white mt-1.5">{stat.val}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{stat.sub}</div>
                </div>
              ))}
            </div>

            {matches.length > 0 && (
              <div className="flex items-center space-x-3 overflow-x-auto pb-2">
                <span className="text-xs font-bold text-slate-400 whitespace-nowrap">Select Match:</span>
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => loadMatchScorecard(m.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border ${
                      selectedMatchId === m.id
                        ? "bg-emerald-600/30 text-emerald-400 border-emerald-500/50"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    {m.teamA?.shortName || m.teamA?.name} vs {m.teamB?.shortName || m.teamB?.name}
                  </button>
                ))}
              </div>
            )}

            {matchScorecard?.match ? (
              <div className="bg-[#1c2541]/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-5 border-b border-slate-800 gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {matchScorecard.match.status}
                      </span>
                      <span className="text-xs text-slate-400">
                        {matchScorecard.match.venue} • {new Date(matchScorecard.match.scheduledAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-white mt-2">
                      {matchScorecard.match.teamA?.name} vs {matchScorecard.match.teamB?.name}
                    </h3>
                    <p className="text-xs text-emerald-400 font-semibold mt-0.5">
                      {matchScorecard.match.resultSummary || "Match in progress"}
                    </p>
                  </div>

                  {matchScorecard?.scorecard?.innings?.length > 0 && (
                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                      {matchScorecard.scorecard.innings.map((inn: any, idx: number) => (
                        <button
                          key={inn.inningsId}
                          onClick={() => setActiveInningsTab(idx)}
                          className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                            activeInningsTab === idx
                              ? "bg-emerald-600 text-white shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          Innings {inn.inningsNumber} ({inn.totalRuns}/{inn.wickets})
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {currentInnings && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Score & Wickets</span>
                        <div className="text-2xl font-black text-white">{currentInnings.totalRuns} / {currentInnings.wickets}</div>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Overs Bowled</span>
                        <div className="text-2xl font-black text-emerald-400">{currentInnings.oversFormatted}</div>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Run Rate</span>
                        <div className="text-2xl font-bold text-slate-200">
                          {currentInnings.legalBalls > 0
                            ? ((currentInnings.totalRuns / currentInnings.legalBalls) * 6).toFixed(2)
                            : "0.00"}
                        </div>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Extras</span>
                        <div className="text-2xl font-bold text-slate-200">{currentInnings.extras}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                        <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider mb-3">Batting</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase">
                                <th className="pb-2">Batter</th>
                                <th className="pb-2 text-right">R</th>
                                <th className="pb-2 text-right">B</th>
                                <th className="pb-2 text-right">4s</th>
                                <th className="pb-2 text-right">6s</th>
                                <th className="pb-2 text-right font-bold text-emerald-400">SR</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {currentInnings.batting?.map((b: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-800/30">
                                  <td className="py-2.5">
                                    <div className="font-bold text-slate-200">{b.name}</div>
                                    <div className="text-[10px] text-slate-400">{b.dismissal}</div>
                                  </td>
                                  <td className="py-2.5 text-right font-black text-white">{b.runs}</td>
                                  <td className="py-2.5 text-right text-slate-300">{b.balls}</td>
                                  <td className="py-2.5 text-right text-slate-300">{b.fours}</td>
                                  <td className="py-2.5 text-right text-slate-300">{b.sixes}</td>
                                  <td className="py-2.5 text-right font-bold text-emerald-400">{b.strikeRate}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5">
                        <h4 className="text-xs font-black uppercase text-slate-300 tracking-wider mb-3">Bowling</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase">
                                <th className="pb-2">Bowler</th>
                                <th className="pb-2 text-right">O</th>
                                <th className="pb-2 text-right">R</th>
                                <th className="pb-2 text-right">Ex</th>
                                <th className="pb-2 text-right font-bold text-white">W</th>
                                <th className="pb-2 text-right font-bold text-emerald-400">Econ</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                              {currentInnings.bowling?.map((bw: any, idx: number) => (
                                <tr key={idx} className="hover:bg-slate-800/30">
                                  <td className="py-2.5 font-bold text-slate-200">{bw.name}</td>
                                  <td className="py-2.5 text-right text-slate-300">{bw.oversFormatted}</td>
                                  <td className="py-2.5 text-right text-slate-300">{bw.runsConceded}</td>
                                  <td className="py-2.5 text-right text-slate-400">{bw.extras}</td>
                                  <td className="py-2.5 text-right font-black text-rose-400">{bw.wickets}</td>
                                  <td className="py-2.5 text-right font-bold text-emerald-400">{bw.economyRate}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#1c2541]/90 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                <Calendar className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-60" />
                <h4 className="text-base font-bold text-white">No Match Data</h4>
                <p className="text-xs text-slate-400 mt-1">Upload a PDF or long image scorecard in the Imports section to populate live tournament results.</p>
              </div>
            )}
          </div>
        )}

        {/* ===================== IMPORTS VIEW (PDF / Long Image 2-Step Verification) ===================== */}
        {activeTab === "imports" && (
          <div className="space-y-6">
            {/* Step 1: Upload PDF / Long Image */}
            {importStep === "UPLOAD" && (
              <div className="bg-[#1c2541]/90 border border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-4">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white">Upload Scorecard (PDF / Long Image)</h3>
                <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">
                  Upload your cricket match PDF or full-length image screenshot. CrickView will automatically extract all fields and navigate to the cross-verification review page before updating records.
                </p>

                <div className="mt-8 border-2 border-dashed border-slate-700 hover:border-emerald-500/50 rounded-2xl p-8 transition bg-slate-900/40">
                  <input
                    type="file"
                    id="scorecard-upload"
                    accept=".pdf,image/*"
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleDocumentUpload(file);
                    }}
                    className="hidden"
                  />
                  <label htmlFor="scorecard-upload" className="cursor-pointer flex flex-col items-center">
                    <FileText className="w-10 h-10 text-emerald-400 mb-3" />
                    <span className="text-sm font-bold text-white">
                      {isUploading ? "Extracting Scorecard Data..." : "Choose PDF or Long Image to Upload"}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">Supports PDF, PNG, JPG</span>
                  </label>
                </div>
              </div>
            )}

            {/* Step 2: Cross Verification & Client Update Page */}
            {importStep === "VERIFY_EDIT" && parsedScorecard && (
              <div className="bg-[#1c2541]/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-slate-800 gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Step 2: Cross Verification & Client Review
                      </span>
                      <span className="text-xs text-slate-400">File: {uploadFileName}</span>
                    </div>
                    <h3 className="text-xl font-black text-white mt-2">
                      Review Extracted Match Details Before Committing
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Verify or edit any extracted fields and map imported players to existing registered players.
                    </p>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setImportStep("UPLOAD")}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmAndCommitScorecard}
                      disabled={loading}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center space-x-2 shadow-md"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Update Records</span>
                    </button>
                  </div>
                </div>

                {/* Editable Match Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Match Title / Tournament</label>
                    <input
                      type="text"
                      value={parsedScorecard.matchTitle}
                      onChange={(e) => setParsedScorecard({ ...parsedScorecard, matchTitle: e.target.value })}
                      placeholder="Match or tournament title"
                      className="w-full mt-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Result Summary</label>
                    <input
                      type="text"
                      value={parsedScorecard.resultSummary}
                      onChange={(e) => setParsedScorecard({ ...parsedScorecard, resultSummary: e.target.value })}
                      placeholder="e.g. Won by 11 runs"
                      className="w-full mt-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Team Scores</label>
                    <div className="flex space-x-2 mt-1">
                      <input
                        type="text"
                        value={parsedScorecard.teamA.score}
                        onChange={(e) => setParsedScorecard({
                          ...parsedScorecard,
                          teamA: { ...parsedScorecard.teamA, score: e.target.value }
                        })}
                        placeholder="Team 1 score"
                        className="w-1/2 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                      />
                      <input
                        type="text"
                        value={parsedScorecard.teamB.score}
                        onChange={(e) => setParsedScorecard({
                          ...parsedScorecard,
                          teamB: { ...parsedScorecard.teamB, score: e.target.value }
                        })}
                        placeholder="Team 2 score"
                        className="w-1/2 px-2 py-1.5 bg-slate-950 border border-slate-800 rounded text-xs text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Batting Verification & Player Mapping */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                      Batting Data & Player Mapping
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Match imported names to Registered Players (Unique ID)
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase">
                          <th className="pb-2">Imported Name</th>
                          <th className="pb-2">Mapped Registered Player</th>
                          <th className="pb-2 text-right">R</th>
                          <th className="pb-2 text-right">B</th>
                          <th className="pb-2 text-right">4s</th>
                          <th className="pb-2 text-right">6s</th>
                          <th className="pb-2 text-right">SR</th>
                          <th className="pb-2">Dismissal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parsedScorecard.batting.map((b: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2.5 font-bold text-white">
                              <input
                                type="text"
                                value={b.name}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].name = e.target.value;
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="bg-transparent border-b border-slate-700 text-xs text-white py-0.5 focus:border-emerald-500 focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5">
                              <select
                                value={b.mappedPlayerId || ""}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].mappedPlayerId = e.target.value || undefined;
                                  updated[idx].isMapped = Boolean(e.target.value);
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:border-emerald-500"
                              >
                                <option value="">-- Auto-Register as New Player --</option>
                                {players.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.uniquePlayerCode || "ID"})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 text-right font-bold text-white">
                              <input
                                type="number"
                                value={b.runs}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].runs = parseInt(e.target.value, 10) || 0;
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="w-12 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right text-xs text-white"
                              />
                            </td>
                            <td className="py-2.5 text-right text-slate-300">
                              <input
                                type="number"
                                value={b.balls}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].balls = parseInt(e.target.value, 10) || 0;
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="w-12 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right text-xs text-white"
                              />
                            </td>
                            <td className="py-2.5 text-right text-slate-300">
                              <input
                                type="number"
                                value={b.fours}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].fours = parseInt(e.target.value, 10) || 0;
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="w-10 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right text-xs text-white"
                              />
                            </td>
                            <td className="py-2.5 text-right text-slate-300">
                              <input
                                type="number"
                                value={b.sixes}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].sixes = parseInt(e.target.value, 10) || 0;
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="w-10 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right text-xs text-white"
                              />
                            </td>
                            <td className="py-2.5 text-right font-bold text-emerald-400">
                              {b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : "0.0"}
                            </td>
                            <td className="py-2.5 text-slate-400">
                              <input
                                type="text"
                                value={b.dismissal}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.batting];
                                  updated[idx].dismissal = e.target.value;
                                  setParsedScorecard({ ...parsedScorecard, batting: updated });
                                }}
                                className="bg-transparent border-b border-slate-800 text-xs text-slate-300 py-0.5 focus:border-emerald-500 focus:outline-none"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Bowling Verification */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 mb-3">
                    Bowling Figures Verification
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-bold uppercase">
                          <th className="pb-2">Bowler</th>
                          <th className="pb-2">Mapped Registered Player</th>
                          <th className="pb-2 text-right">O</th>
                          <th className="pb-2 text-right">R</th>
                          <th className="pb-2 text-right">Ex</th>
                          <th className="pb-2 text-right">W</th>
                          <th className="pb-2 text-right">Econ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parsedScorecard.bowling.map((bw: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2.5 font-bold text-white">{bw.name}</td>
                            <td className="py-2.5">
                              <select
                                value={bw.mappedPlayerId || ""}
                                onChange={(e) => {
                                  const updated = [...parsedScorecard.bowling];
                                  updated[idx].mappedPlayerId = e.target.value || undefined;
                                  setParsedScorecard({ ...parsedScorecard, bowling: updated });
                                }}
                                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200"
                              >
                                <option value="">-- Auto-Register as Bowler --</option>
                                {players.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.uniquePlayerCode || "ID"})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2.5 text-right text-slate-300">{bw.overs}</td>
                            <td className="py-2.5 text-right font-bold text-white">{bw.runs}</td>
                            <td className="py-2.5 text-right text-slate-400">{bw.extras}</td>
                            <td className="py-2.5 text-right font-black text-rose-400">{bw.wickets}</td>
                            <td className="py-2.5 text-right font-bold text-emerald-400">{bw.economy}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Success Confirmation */}
            {importStep === "SUCCESS" && (
              <div className="bg-[#1c2541]/90 border border-slate-800 rounded-2xl p-8 max-w-xl mx-auto text-center">
                <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white">Scorecard Verified & Records Updated!</h3>
                <p className="text-xs text-slate-400 mt-2">
                  All match statistics, batting scorecards, and bowling figures have been committed to the database and mapped to player records.
                </p>
                <div className="mt-6 flex justify-center space-x-3">
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
                  >
                    View In Dashboard
                  </button>
                  <button
                    onClick={() => setImportStep("UPLOAD")}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                  >
                    Import Another Match
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== PLAYERS VIEW (Registration, Edit Button & Modal) ===================== */}
        {activeTab === "players" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-white">Player Roster & Unique IDs</h3>
                <p className="text-xs text-slate-400 mt-0.5">Register, manage and edit players. Auto-generates unique ID for scorecard mapping.</p>
              </div>
              <button
                onClick={() => setIsRegisteringPlayer(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg flex items-center space-x-2 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Register Player with Photo</span>
              </button>
            </div>

            {/* Modal for One-Time Player Registration */}
            {isRegisteringPlayer && (
              <div className="bg-[#1c2541] border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                  <h4 className="text-sm font-bold text-white">Register Player</h4>
                  <button
                    onClick={() => setIsRegisteringPlayer(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <form onSubmit={handleCreatePlayer} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Player Full Name</label>
                    <input
                      type="text"
                      required
                      value={newPlayerForm.name}
                      onChange={(e) => setNewPlayerForm({ ...newPlayerForm, name: e.target.value })}
                      placeholder="Player full name"
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Display Name / Short</label>
                    <input
                      type="text"
                      value={newPlayerForm.displayName}
                      onChange={(e) => setNewPlayerForm({ ...newPlayerForm, displayName: e.target.value })}
                      placeholder="Display name"
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Profile Photo URL</label>
                    <input
                      type="url"
                      value={newPlayerForm.photoUrl}
                      onChange={(e) => setNewPlayerForm({ ...newPlayerForm, photoUrl: e.target.value })}
                      placeholder="Photo URL"
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Primary Role</label>
                    <select
                      value={newPlayerForm.primaryRole}
                      onChange={(e) => setNewPlayerForm({ ...newPlayerForm, primaryRole: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      <option value="BATTER">Batter</option>
                      <option value="BOWLER">Bowler</option>
                      <option value="ALL_ROUNDER">All Rounder</option>
                      <option value="WICKET_KEEPER">Wicket Keeper</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Batting Style</label>
                    <select
                      value={newPlayerForm.battingStyle}
                      onChange={(e) => setNewPlayerForm({ ...newPlayerForm, battingStyle: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      <option value="RIGHT_HAND">Right Hand Bat</option>
                      <option value="LEFT_HAND">Left Hand Bat</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
                    >
                      Save Player & Generate ID
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Modal for Editing Player Record */}
            {editingPlayer && (
              <div className="bg-[#1c2541] border border-emerald-500/50 rounded-2xl p-6 shadow-2xl relative">
                <div className="flex justify-between items-center pb-3 border-b border-slate-800 mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-white">Edit Player: {editingPlayer.name}</h4>
                    <span className="text-[11px] text-emerald-400 font-mono">{editingPlayer.uniquePlayerCode}</span>
                  </div>
                  <button
                    onClick={() => setEditingPlayer(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleUpdatePlayer} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Full Name</label>
                    <input
                      type="text"
                      required
                      value={editingPlayer.name}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Display Name</label>
                    <input
                      type="text"
                      value={editingPlayer.displayName}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, displayName: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Profile Photo URL</label>
                    <input
                      type="url"
                      value={editingPlayer.photoUrl || ""}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, photoUrl: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Primary Role</label>
                    <select
                      value={editingPlayer.primaryRole}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, primaryRole: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      <option value="BATTER">Batter</option>
                      <option value="BOWLER">Bowler</option>
                      <option value="ALL_ROUNDER">All Rounder</option>
                      <option value="WICKET_KEEPER">Wicket Keeper</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase">Batting Style</label>
                    <select
                      value={editingPlayer.battingStyle}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, battingStyle: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                    >
                      <option value="RIGHT_HAND">Right Hand Bat</option>
                      <option value="LEFT_HAND">Left Hand Bat</option>
                    </select>
                  </div>

                  <div className="flex items-end space-x-2">
                    <button
                      type="submit"
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
                    >
                      Update Player
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingPlayer(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Players Grid with Photo, Unique ID and Edit Button */}
            {players.length === 0 ? (
              <div className="text-center py-12 bg-[#1c2541]/50 border border-dashed border-slate-800 rounded-2xl text-slate-400">
                <Users className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-50" />
                <h4 className="text-base font-bold text-white">No Players Registered</h4>
                <p className="text-xs text-slate-400 mt-1">Register your first player using the button above or import via scorecard document.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {players.map((p) => (
                  <div key={p.id} className="bg-[#1c2541]/90 border border-slate-800 p-4 rounded-xl shadow-sm relative group">
                    <div className="flex items-center space-x-3">
                      {p.photoUrl ? (
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          className="w-11 h-11 rounded-full object-cover border border-slate-700"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-emerald-500/20 text-emerald-400 font-black flex items-center justify-center text-sm border border-emerald-500/30">
                          {p.displayName ? p.displayName.charAt(0) : "P"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-white truncate">{p.name}</h4>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400">
                          {p.uniquePlayerCode || "ID: AUTO"}
                        </span>
                      </div>
                      {/* Button to edit player record */}
                      <button
                        onClick={() => setEditingPlayer(p)}
                        className="p-1.5 bg-slate-800 hover:bg-emerald-600/30 hover:text-emerald-400 text-slate-400 rounded-lg transition border border-slate-700"
                        title="Edit Player Record"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex justify-between text-[11px] text-slate-400">
                      <span>{p.primaryRole}</span>
                      <span>{p.battingStyle?.replace("_", " ")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===================== TOURNAMENTS VIEW ===================== */}
        {activeTab === "tournaments" && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Tournaments & Configurations</h3>
              <button
                onClick={() => {
                  const name = prompt("Tournament Name:");
                  const season = prompt("Season (e.g. 2026):", "2026");
                  if (name && season) {
                    api.post("/tournaments", { name, season, format: "T20" }).then(() => loadAllData());
                  }
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg flex items-center space-x-2 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create Tournament</span>
              </button>
            </div>

            {tournaments.length === 0 ? (
              <div className="text-center py-12 bg-[#1c2541]/50 border border-dashed border-slate-800 rounded-2xl text-slate-400">
                <Trophy className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-50" />
                <h4 className="text-base font-bold text-white">No Tournaments Configured</h4>
                <p className="text-xs text-slate-400 mt-1">Create your first tournament using the button above.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tournaments.map((t) => (
                  <div key={t.id} className="bg-[#1c2541]/90 border border-slate-800 p-5 rounded-2xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-base font-bold text-white">{t.name}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Season {t.season} • {t.format}</p>
                      </div>
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                        {t.defaultOvers} Overs
                      </span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between text-xs text-slate-400">
                      <span>{t._count?.teams || 0} Teams</span>
                      <span>{t._count?.matches || 0} Matches</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

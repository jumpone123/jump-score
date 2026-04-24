"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "./firebase";

type ScoreItem = {
  id?: string;
  name: string;
  team: string;
  category: string;
  score: number;
  replayScore?: number | null;
  createdAt?: any;
};

type RankedItem = ScoreItem & {
  displayRank: number;
  rankText: string;
  point: number;
  needsReplay: boolean;
};

const ADMIN_PASSWORD = "jumpone";

const categories = [
  "30초 번갈아뛰기",
  "1분 30초 번갈아뛰기",
  "3분 번갈아뛰기",
  "30초 이중뛰기",
  "이중뛰기",
  "30초 양발모아뛰기",
  "30초 엇걸어풀어뛰기",
];

const pointsByRank: Record<number, number> = {
  1: 20,
  2: 18,
  3: 16,
  4: 14,
  5: 12,
  6: 10,
  7: 8,
  8: 6,
};

export default function Home() {
  const [scores, setScores] = useState<ScoreItem[]>([]);
  const [category, setCategory] = useState(categories[0]);
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [score, setScore] = useState("");
  const [admin, setAdmin] = useState(false);
  const [mode, setMode] = useState<"main" | "input">("main");
  const [replayInputs, setReplayInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    setSiteUrl(window.location.origin);

    if (url.searchParams.get("mode") === "input") setMode("input");

    if (url.searchParams.get("admin") === "1") {
      const pw = prompt("관리자 비밀번호를 입력하세요");
      if (pw === ADMIN_PASSWORD) setAdmin(true);
      else alert("관리자만 접근 가능합니다.");
    }

    loadScores();
  }, []);

  async function loadScores() {
    setLoading(true);
    const q = query(collection(db, "scores"), orderBy("score", "desc"));
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as ScoreItem),
    }));
    setScores(data);
    setLoading(false);
  }

  function getRanking(list: ScoreItem[]): RankedItem[] {
    const sortedByMain = [...list].sort((a, b) => b.score - a.score);
    const groups: ScoreItem[][] = [];

    sortedByMain.forEach((item) => {
      const last = groups[groups.length - 1];
      if (!last || last[0].score !== item.score) groups.push([item]);
      else last.push(item);
    });

    const finalList: RankedItem[] = [];
    let currentRank = 1;

    groups.forEach((group) => {
      if (group.length === 1) {
        finalList.push({
          ...group[0],
          displayRank: currentRank,
          rankText: `${currentRank}위`,
          point: pointsByRank[currentRank] ?? 0,
          needsReplay: false,
        });
        currentRank += 1;
        return;
      }

      const allReplayDone = group.every(
        (x) => x.replayScore !== null && x.replayScore !== undefined
      );

      if (!allReplayDone) {
        group.forEach((item) => {
          finalList.push({
            ...item,
            displayRank: currentRank,
            rankText: `공동 ${currentRank}위`,
            point: pointsByRank[currentRank] ?? 0,
            needsReplay: true,
          });
        });
        currentRank += group.length;
        return;
      }

      const replaySorted = [...group].sort(
        (a, b) => Number(b.replayScore) - Number(a.replayScore)
      );

      let replayRank = currentRank;
      let index = 0;

      while (index < replaySorted.length) {
        const baseReplayScore = Number(replaySorted[index].replayScore);
        const sameReplay = replaySorted.filter(
          (x) => Number(x.replayScore) === baseReplayScore
        );

        sameReplay.forEach((item) => {
          const stillTie = sameReplay.length > 1;
          finalList.push({
            ...item,
            displayRank: replayRank,
            rankText: stillTie ? `공동 ${replayRank}위` : `${replayRank}위`,
            point: pointsByRank[replayRank] ?? 0,
            needsReplay: stillTie,
          });
        });

        replayRank += sameReplay.length;
        index += sameReplay.length;
      }

      currentRank += group.length;
    });

    return finalList;
  }

  const categoryRankings = useMemo(() => {
    const result: Record<string, RankedItem[]> = {};
    categories.forEach((cat) => {
      result[cat] = getRanking(scores.filter((s) => s.category === cat));
    });
    return result;
  }, [scores]);

  const teamRankings = useMemo(() => {
    const map: Record<string, number> = {};

    categories.forEach((cat) => {
      categoryRankings[cat].forEach((item) => {
        if (!item.team) return;
        map[item.team] = (map[item.team] || 0) + item.point;
      });
    });

    return Object.entries(map)
      .map(([team, point]) => ({ team, point }))
      .sort((a, b) => b.point - a.point);
  }, [categoryRankings]);

  async function saveScore() {
    if (!admin && mode !== "input") {
      alert("기록 입력은 관리자 또는 모바일 입력 페이지에서만 가능합니다.");
      return;
    }

    if (!name || !team || !score) {
      alert("이름, 소속팀, 기록을 모두 입력하세요.");
      return;
    }

    await addDoc(collection(db, "scores"), {
      category,
      name: name.trim(),
      team: team.trim(),
      score: Number(score),
      replayScore: null,
      createdAt: new Date(),
    });

    setName("");
    setTeam("");
    setScore("");
    loadScores();
  }

  function handleEnter(
    e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveScore();
    }
  }

  async function saveReplay(id?: string) {
    if (!admin || !id) return alert("관리자만 가능합니다.");

    const value = replayInputs[id];
    if (!value) return alert("재경기 기록을 입력하세요.");

    await updateDoc(doc(db, "scores", id), {
      replayScore: Number(value),
    });

    setReplayInputs((prev) => ({ ...prev, [id]: "" }));
    loadScores();
  }

  async function deleteOne(id?: string) {
    if (!admin || !id) return alert("관리자만 삭제할 수 있습니다.");
    if (!confirm("이 기록을 삭제할까요?")) return;

    await deleteDoc(doc(db, "scores", id));
    loadScores();
  }

  async function deleteAll() {
    if (!admin) return alert("관리자만 삭제할 수 있습니다.");
    if (!confirm("전체 기록을 삭제할까요?")) return;

    const snap = await getDocs(collection(db, "scores"));
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, "scores", d.id))));
    loadScores();
  }

  function downloadExcelCsv() {
    const rows = [
      ["종목", "순위", "이름", "소속팀", "원기록", "재경기기록", "포인트"],
    ];

    categories.forEach((cat) => {
      categoryRankings[cat].forEach((item) => {
        rows.push([
          cat,
          item.rankText,
          item.name,
          item.team,
          `${item.score}`,
          item.replayScore ?? "",
          `${item.point}`,
        ]);
      });
    });

    rows.push([]);
    rows.push(["팀별 랭킹"]);
    rows.push(["순위", "팀명", "포인트"]);

    teamRankings.forEach((t, i) => {
      rows.push([`${i + 1}위`, t.team, `${t.point}`]);
    });

    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "줄넘기_대회_기록.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function rankIcon(item: RankedItem) {
    if (item.needsReplay) return item.rankText;
    if (item.displayRank === 1) return "🥇";
    if (item.displayRank === 2) return "🥈";
    if (item.displayRank === 3) return "🥉";
    return `${item.displayRank}위`;
  }

  const inputPageUrl = `${siteUrl}?mode=input`;
  const adminPageUrl = `${siteUrl}?admin=1`;

  return (
    <main className="min-h-screen bg-gradient-to-br from-red-600 via-orange-500 to-red-700 p-4 print:bg-white">
      <div className="max-w-6xl mx-auto bg-white rounded-[36px] shadow-2xl overflow-hidden print:shadow-none print:rounded-none">
        <header className="text-center px-6 py-10 bg-gradient-to-r from-white via-orange-50 to-white">
          <h1 className="text-5xl md:text-7xl font-black italic text-red-600">
            JumpOne
          </h1>
          <p className="mt-2 font-bold tracking-widest text-sm">
            최고를 향한 첫 번째 도전
          </p>
          <h2 className="mt-6 text-4xl md:text-5xl font-black">
            <span className="text-red-600">줄넘기 대회</span> 기록판
          </h2>
          <p className="mt-3 text-gray-600">
            종목별 기록을 입력하고 순위를 확인하세요!
          </p>

          <div className="mt-6 flex justify-center gap-3 flex-wrap print:hidden">
            <a
              href={adminPageUrl}
              className="px-5 py-3 rounded-full bg-black text-white font-bold"
            >
              관리자 페이지
            </a>
            <a
              href={inputPageUrl}
              className="px-5 py-3 rounded-full bg-red-600 text-white font-bold"
            >
              모바일 입력 페이지
            </a>
            <button
              onClick={() => window.print()}
              className="px-5 py-3 rounded-full bg-orange-500 text-white font-bold"
            >
              결과 인쇄
            </button>
            <button
              onClick={downloadExcelCsv}
              className="px-5 py-3 rounded-full bg-green-600 text-white font-bold"
            >
              엑셀 다운로드
            </button>
          </div>
        </header>

        {(admin || mode === "input") && (
          <section className="m-6 p-6 rounded-3xl shadow-lg border bg-white print:hidden">
            <h3 className="text-2xl font-black text-red-600 mb-4">
              ✅ 기록 입력
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <select
                className="border rounded-xl p-3"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={handleEnter}
              >
                {categories.map((cat) => (
                  <option key={cat}>{cat}</option>
                ))}
              </select>

              <input
                className="border rounded-xl p-3"
                placeholder="이름"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleEnter}
              />

              <input
                className="border rounded-xl p-3"
                placeholder="소속팀"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                onKeyDown={handleEnter}
              />

              <input
                className="border rounded-xl p-3"
                placeholder="기록 횟수"
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                onKeyDown={handleEnter}
              />

              <button
                onClick={saveScore}
                className="bg-red-600 text-white rounded-xl font-black p-3"
              >
                저장하기
              </button>
            </div>

            {admin && (
              <>
                <div className="mt-5 p-4 bg-orange-50 rounded-2xl text-sm">
                  <p className="font-bold">📱 QR용 모바일 입력 주소</p>
                  <p className="break-all">{inputPageUrl}</p>
                </div>

                <button
                  onClick={deleteAll}
                  className="mt-4 w-full border border-red-300 text-red-600 rounded-xl p-3 font-bold"
                >
                  🗑 전체 기록 삭제
                </button>
              </>
            )}
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6">
          {categories.map((cat) => (
            <div key={cat} className="bg-white rounded-3xl shadow-xl p-5 border">
              <h3 className="text-xl font-black text-red-600 border-b pb-3">
                🏅 {cat}
              </h3>

              <div className="mt-4 space-y-3">
                {categoryRankings[cat].length === 0 && (
                  <p className="text-gray-400">아직 기록이 없습니다.</p>
                )}

                {categoryRankings[cat].slice(0, 8).map((item) => (
                  <div key={item.id} className="border-b pb-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <div>
                          <span className="font-black mr-2">
                            {rankIcon(item)}
                          </span>
                          <span className="font-bold">{item.name}</span>
                          {item.needsReplay && (
                            <span className="ml-2 text-xs text-red-600 font-black">
                              재경기
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">{item.team}</div>
                      </div>

                      <div className="text-right">
                        <div className="font-black">{item.score}회</div>
                        {item.replayScore !== null &&
                          item.replayScore !== undefined && (
                            <div className="text-xs text-blue-600">
                              재경기 {item.replayScore}회
                            </div>
                          )}
                        <div className="text-xs text-orange-600">
                          {item.point}pt
                        </div>
                      </div>
                    </div>

                    {admin && item.needsReplay && (
                      <div className="mt-3 flex gap-2 print:hidden">
                        <input
                          className="border rounded-lg p-2 w-full"
                          type="number"
                          placeholder="재경기 기록"
                          value={replayInputs[item.id || ""] || ""}
                          onChange={(e) =>
                            setReplayInputs((prev) => ({
                              ...prev,
                              [item.id || ""]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveReplay(item.id);
                            }
                          }}
                        />
                        <button
                          onClick={() => saveReplay(item.id)}
                          className="bg-orange-500 text-white px-3 rounded-lg font-bold"
                        >
                          저장
                        </button>
                      </div>
                    )}

                    {admin && (
                      <button
                        onClick={() => deleteOne(item.id)}
                        className="mt-2 text-red-500 text-sm font-bold print:hidden"
                      >
                        개인 기록 삭제
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="m-6 p-6 rounded-3xl shadow-xl bg-orange-50 border">
          <h3 className="text-2xl font-black text-orange-600 mb-4">
            🏆 팀별 랭킹
          </h3>

          {teamRankings.length === 0 && (
            <p className="text-gray-400">아직 팀 기록이 없습니다.</p>
          )}

          {teamRankings.map((team, index) => (
            <div
              key={team.team}
              className="flex justify-between border-b py-3 text-lg"
            >
              <span className="font-black">
                {index + 1}위 - {team.team}
              </span>
              <span className="font-black text-red-600">{team.point}pt</span>
            </div>
          ))}
        </section>

        <footer className="bg-red-600 text-white text-center p-6 font-bold">
          © 2024 JumpOne. All rights reserved.
        </footer>

        {loading && (
          <div className="fixed bottom-5 right-5 bg-black text-white px-4 py-2 rounded-xl print:hidden">
            불러오는 중...
          </div>
        )}
      </div>
    </main>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
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
  point: number;
  replay: boolean;
  createdAt?: any;
};

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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("admin") === "1") {
      const pw = prompt("관리자 비밀번호를 입력하세요");
      if (pw === "jumpone") setAdmin(true);
      else alert("관리자만 수정할 수 있습니다.");
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

  function calculateRanks(list: ScoreItem[]) {
    const sorted = [...list].sort((a, b) => b.score - a.score);

    return sorted.map((item, index) => {
      const sameScore = sorted.filter((x) => x.score === item.score);
      const rank = index + 1;
      const replay = sameScore.length > 1 && rank <= 3;

      return {
        ...item,
        rank,
        point: pointsByRank[rank] ?? 0,
        replay,
      };
    });
  }

  const categoryRankings = useMemo(() => {
    const result: Record<string, ScoreItem[]> = {};
    categories.forEach((cat) => {
      const filtered = scores.filter((s) => s.category === cat);
      result[cat] = calculateRanks(filtered);
    });
    return result;
  }, [scores]);

  const teamRankings = useMemo(() => {
    const teamMap: Record<string, number> = {};

    categories.forEach((cat) => {
      categoryRankings[cat]?.forEach((item: any) => {
        teamMap[item.team] = (teamMap[item.team] || 0) + item.point;
      });
    });

    return Object.entries(teamMap)
      .map(([team, point]) => ({ team, point }))
      .sort((a, b) => b.point - a.point);
  }, [categoryRankings]);

  async function saveScore() {
    if (!admin) {
      alert("기록 입력은 관리자만 가능합니다.");
      return;
    }

    if (!name || !team || !score) {
      alert("이름, 소속팀, 기록을 모두 입력하세요.");
      return;
    }

    await addDoc(collection(db, "scores"), {
      name,
      team,
      category,
      score: Number(score),
      point: 0,
      replay: false,
      createdAt: new Date(),
    });

    setName("");
    setTeam("");
    setScore("");
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-red-600 via-orange-500 to-red-700 p-4">
      <div className="max-w-6xl mx-auto bg-white rounded-[32px] shadow-2xl overflow-hidden">
        <header className="text-center p-8 bg-gradient-to-r from-white to-orange-50">
          <h1 className="text-5xl font-black text-red-600 italic">JumpOne</h1>
          <p className="mt-2 text-sm tracking-widest font-bold">
            최고를 향한 첫 번째 도전
          </p>
          <h2 className="mt-6 text-4xl font-black">
            <span className="text-red-600">줄넘기 대회</span> 기록판
          </h2>
          <p className="mt-2 text-gray-600">
            종목별 기록을 입력하고 순위를 확인하세요!
          </p>
        </header>

        {admin && (
          <section className="m-6 p-6 rounded-3xl shadow-lg border bg-white">
            <h3 className="text-2xl font-black text-red-600 mb-4">기록 입력</h3>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <select
                className="border rounded-xl p-3"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
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
              />

              <input
                className="border rounded-xl p-3"
                placeholder="소속팀"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              />

              <input
                className="border rounded-xl p-3"
                placeholder="기록 횟수"
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
              />

              <button
                onClick={saveScore}
                className="bg-red-600 text-white rounded-xl font-black"
              >
                저장하기
              </button>
            </div>

            <button
              onClick={deleteAll}
              className="mt-4 w-full border border-red-300 text-red-600 rounded-xl p-3 font-bold"
            >
              전체 기록 삭제
            </button>
          </section>
        )}

        {!admin && (
          <div className="text-center my-4">
            <a
              href="?admin=1"
              className="inline-block px-5 py-2 rounded-full bg-black text-white text-sm"
            >
              관리자 페이지
            </a>
          </div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 p-6">
          {categories.map((cat) => (
            <div key={cat} className="bg-white rounded-3xl shadow-xl p-5 border">
              <h3 className="text-xl font-black text-red-600 border-b pb-3">
                🏅 {cat}
              </h3>

              <div className="mt-4 space-y-3">
                {categoryRankings[cat]?.length === 0 && (
                  <p className="text-gray-400">아직 기록이 없습니다.</p>
                )}

                {categoryRankings[cat]?.slice(0, 8).map((item: any) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center border-b pb-2"
                  >
                    <div>
                      <span className="font-black mr-2">
                        {item.rank === 1
                          ? "🥇"
                          : item.rank === 2
                          ? "🥈"
                          : item.rank === 3
                          ? "🥉"
                          : item.rank}
                      </span>
                      <span className="font-bold">{item.name}</span>
                      {item.replay && (
                        <span className="ml-2 text-xs text-red-600 font-black">
                          재경기
                        </span>
                      )}
                      <div className="text-xs text-gray-500">{item.team}</div>
                    </div>

                    <div className="text-right">
                      <div className="font-black">{item.score}회</div>
                      <div className="text-xs text-orange-600">
                        {item.point}pt
                      </div>
                    </div>

                    {admin && (
                      <button
                        onClick={() => deleteOne(item.id)}
                        className="ml-2 text-red-500 text-sm"
                      >
                        삭제
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
          <div className="fixed bottom-5 right-5 bg-black text-white px-4 py-2 rounded-xl">
            불러오는 중...
          </div>
        )}
      </div>
    </main>
  );
}
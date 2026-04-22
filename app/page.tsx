"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type ScoreItem = {
  id?: string;
  name: string;
  team: string;
  score: number;
  point: number;
  category: string;
  replayScore?: number | null;
  createdAt?: any;
  displayRank?: number;
  needsReplay?: boolean;
};

const categories = [
  "30초 번갈아뛰기",
  "1분 30초 번갈아뛰기",
  "30초 양발모아뛰기",
  "30초 2중뛰기",
  "3중뛰기",
];

const categoryAccent: Record<string, string> = {
  "30초 번갈아뛰기": "#e91b23",
  "1분 30초 번갈아뛰기": "#ff8a00",
  "30초 양발모아뛰기": "#e91b23",
  "30초 2중뛰기": "#ff8a00",
  "3중뛰기": "#e91b23",
};

function getPointByRank(rank: number) {
  if (rank === 1) return 20;
  if (rank === 2) return 18;
  if (rank === 3) return 16;
  if (rank === 4) return 14;
  if (rank === 5) return 12;
  if (rank === 6) return 10;
  if (rank === 7) return 8;
  if (rank === 8) return 6;
  return 0;
}

function getTimeValue(item: ScoreItem) {
  return item.createdAt?.seconds ?? 0;
}

export default function Home() {
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [score, setScore] = useState("");
  const [category, setCategory] = useState("30초 번갈아뛰기");
  const [scores, setScores] = useState<ScoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReplayOnly, setShowReplayOnly] = useState(false);
  const [replayInputs, setReplayInputs] = useState<Record<string, string>>({});

  const loadScores = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, "scores"));
      const list: ScoreItem[] = [];

      snapshot.forEach((docItem) => {
        const data = docItem.data() as Omit<ScoreItem, "id">;
        list.push({
          id: docItem.id,
          name: data.name || "",
          team: data.team || "",
          score: Number(data.score || 0),
          point: Number(data.point || 0),
          category: data.category || "30초 번갈아뛰기",
          replayScore:
            data.replayScore === undefined ? null : Number(data.replayScore),
          createdAt: data.createdAt,
        });
      });

      list.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category, "ko");
        }
        if (b.score !== a.score) return b.score - a.score;
        return getTimeValue(a) - getTimeValue(b);
      });

      setScores(list);
    } catch (error) {
      console.error(error);
      alert("기록 불러오기 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScores();
  }, []);

  const resolveTieGroup = (group: ScoreItem[], startRank: number) => {
    if (group.length === 1) {
      return [
        {
          ...group[0],
          displayRank: startRank,
          point: getPointByRank(startRank),
          needsReplay: false,
        },
      ];
    }

    const allReplayEntered = group.every(
      (item) => item.replayScore !== null && item.replayScore !== undefined
    );

    if (!allReplayEntered) {
      return group.map((item) => ({
        ...item,
        displayRank: startRank,
        point: getPointByRank(startRank),
        needsReplay: true,
      }));
    }

    const replaySorted = [...group].sort((a, b) => {
      const aReplay = a.replayScore ?? -1;
      const bReplay = b.replayScore ?? -1;

      if (bReplay !== aReplay) return bReplay - aReplay;
      return getTimeValue(a) - getTimeValue(b);
    });

    const resolved: ScoreItem[] = [];
    let rankCursor = startRank;
    let i = 0;

    while (i < replaySorted.length) {
      let j = i + 1;
      while (
        j < replaySorted.length &&
        (replaySorted[j].replayScore ?? -1) === (replaySorted[i].replayScore ?? -1)
      ) {
        j++;
      }

      const replayTieGroup = replaySorted.slice(i, j);

      if (replayTieGroup.length === 1) {
        resolved.push({
          ...replayTieGroup[0],
          displayRank: rankCursor,
          point: getPointByRank(rankCursor),
          needsReplay: false,
        });
      } else {
        replayTieGroup.forEach((item) => {
          resolved.push({
            ...item,
            displayRank: rankCursor,
            point: getPointByRank(rankCursor),
            needsReplay: true,
          });
        });
      }

      rankCursor += replayTieGroup.length;
      i = j;
    }

    return resolved;
  };

  const buildCategoryResults = (rawList: ScoreItem[]) => {
    const sorted = [...rawList].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return getTimeValue(a) - getTimeValue(b);
    });

    const result: ScoreItem[] = [];
    let startRank = 1;
    let i = 0;

    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].score === sorted[i].score) {
        j++;
      }

      const tieGroup = sorted.slice(i, j);
      const resolvedGroup = resolveTieGroup(tieGroup, startRank);

      result.push(...resolvedGroup);

      startRank += tieGroup.length;
      i = j;
    }

    return result;
  };

  const groupedScores = useMemo(() => {
    const result: Record<string, ScoreItem[]> = {};

    categories.forEach((cat) => {
      const filtered = scores.filter((item) => item.category === cat);
      result[cat] = buildCategoryResults(filtered);
    });

    return result;
  }, [scores]);

  const teamRankings = useMemo(() => {
    const teamMap: Record<string, number> = {};

    categories.forEach((cat) => {
      const items = groupedScores[cat] || [];

      items.forEach((item) => {
        const teamName = item.team?.trim() || "소속없음";
        const point = item.point || 0;

        if (!teamMap[teamName]) {
          teamMap[teamName] = 0;
        }

        teamMap[teamName] += point;
      });
    });

    return Object.entries(teamMap)
      .map(([team, point]) => ({ team, point }))
      .sort((a, b) => b.point - a.point);
  }, [groupedScores]);

  const replayCandidates = useMemo(() => {
    return categories.flatMap((cat) =>
      (groupedScores[cat] || [])
        .filter((item) => item.needsReplay)
        .map((item) => ({
          ...item,
          category: cat,
        }))
    );
  }, [groupedScores]);

  const saveScore = async () => {
    if (!name.trim() || !team.trim() || !score.trim()) {
      alert("이름, 소속팀, 기록을 모두 입력해");
      return;
    }

    if (isNaN(Number(score))) {
      alert("기록은 숫자로 입력해");
      return;
    }

    try {
      await addDoc(collection(db, "scores"), {
        name: name.trim(),
        team: team.trim(),
        score: Number(score),
        point: 0,
        category,
        replayScore: null,
        createdAt: new Date(),
      });

      alert("저장됨!");
      setName("");
      setTeam("");
      setScore("");
      await loadScores();
    } catch (error) {
      console.error(error);
      alert("저장 실패");
    }
  };

  const saveReplayScore = async (id: string, replayScore: number) => {
    try {
      await updateDoc(doc(db, "scores", id), {
        replayScore,
      });

      setReplayInputs((prev) => ({
        ...prev,
        [id]: "",
      }));

      await loadScores();
    } catch (error) {
      console.error(error);
      alert("재경기 점수 저장 실패");
    }
  };

  const deleteAllScores = async () => {
    const ok = confirm("전체 기록을 삭제할까?");
    if (!ok) return;

    try {
      const snapshot = await getDocs(collection(db, "scores"));
      for (const docItem of snapshot.docs) {
        await deleteDoc(docItem.ref);
      }
      alert("전체 기록 삭제 완료");
      await loadScores();
    } catch (error) {
      console.error(error);
      alert("전체 삭제 실패");
    }
  };

  const deleteCategoryScores = async (targetCategory: string) => {
    const ok = confirm(`${targetCategory} 기록을 전부 삭제할까?`);
    if (!ok) return;

    try {
      const q = query(
        collection(db, "scores"),
        where("category", "==", targetCategory)
      );
      const snapshot = await getDocs(q);

      for (const docItem of snapshot.docs) {
        await deleteDoc(docItem.ref);
      }

      alert("종목 기록 삭제 완료");
      await loadScores();
    } catch (error) {
      console.error(error);
      alert("종목 삭제 실패");
    }
  };

  const exportToExcel = () => {
    const rankingRows: any[] = categories.reduce((acc: any[], cat) => {
      const items = groupedScores[cat] || [];

      if (items.length === 0) {
        acc.push({
          순위: "",
          종목: cat,
          이름: "",
          소속팀: "",
          기록: "",
          재경기점수: "",
          랭킹포인트: "",
          비고: "",
        });
      } else {
        items.forEach((item) => {
          acc.push({
            순위: item.displayRank ?? "",
            종목: cat,
            이름: item.name,
            소속팀: item.team,
            기록: item.score,
            재경기점수: item.replayScore ?? "",
            랭킹포인트: item.point,
            비고: item.needsReplay ? "재경기" : "",
          });
        });
      }

      return acc;
    }, []);

    const teamRows = teamRankings.map((item, index) => ({
      팀순위: index + 1,
      소속팀: item.team,
      총점: item.point,
    }));

    const workbook = XLSX.utils.book_new();

    const rankingSheet = XLSX.utils.json_to_sheet(rankingRows);
    XLSX.utils.book_append_sheet(workbook, rankingSheet, "개인랭킹");

    const teamSheet = XLSX.utils.json_to_sheet(teamRows);
    XLSX.utils.book_append_sheet(workbook, teamSheet, "팀랭킹");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });

    const blob = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    saveAs(blob, "줄넘기_대회_기록.xlsx");
  };

  const printPage = () => {
    window.print();
  };

  const getMedalByRank = (rank?: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return String(rank || "");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #fff8f3 0%, #fff6f0 48%, #fff3ec 100%)",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -120,
          left: -180,
          width: 520,
          height: 320,
          borderRadius: "0 0 320px 0",
          background:
            "linear-gradient(135deg, #ff0f1f 0%, #ff4d00 42%, #ff9f1a 100%)",
          transform: "rotate(-8deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -70,
          left: -80,
          width: 560,
          height: 220,
          borderRadius: "0 0 380px 0",
          border: "22px solid rgba(255,255,255,0.78)",
          borderLeft: "0",
          borderTop: "0",
          transform: "rotate(-7deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -170,
          bottom: -120,
          width: 500,
          height: 320,
          borderRadius: "320px 0 0 0",
          background:
            "linear-gradient(135deg, #ffb020 0%, #ff7a00 34%, #ff2c2c 100%)",
          transform: "rotate(8deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -90,
          bottom: -80,
          width: 560,
          height: 240,
          borderRadius: "420px 0 0 0",
          border: "22px solid rgba(255,255,255,0.78)",
          borderRight: "0",
          borderBottom: "0",
          transform: "rotate(8deg)",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 1080,
          margin: "0 auto",
          padding: "60px 20px 36px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 900,
              fontStyle: "italic",
              lineHeight: 1,
              letterSpacing: "-2px",
              marginBottom: 6,
              background: "linear-gradient(90deg, #e80017 0%, #ff9b18 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            JumpOne
          </div>

          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#1f1f1f",
              marginBottom: 10,
            }}
          >
            최고를 향한 첫 번째 도전
          </div>

          <div
            style={{
              fontSize: 56,
              fontWeight: 900,
              lineHeight: 1.15,
              marginBottom: 10,
              color: "#111",
            }}
          >
            <span style={{ color: "#ef1b22" }}>줄넘기 대회</span> 기록판
          </div>

          <div
            style={{
              fontSize: 18,
              color: "#333",
              fontWeight: 600,
            }}
          >
            종목별 기록을 입력하고 순위를 확인하세요!
          </div>
        </div>

        <div
          style={{
            background: "#f3efef",
            borderRadius: 28,
            padding: 24,
            boxShadow: "0 8px 24px rgba(162, 60, 24, 0.08)",
            border: "1px solid #eadede",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: "#e61c23",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            ☑ 기록 입력
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 1fr 1fr 1fr 0.95fr",
              gap: 14,
              marginBottom: 16,
            }}
          >
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                height: 62,
                borderRadius: 12,
                border: "2px solid #df4d4d",
                padding: "0 16px",
                fontSize: 16,
                fontWeight: 700,
                color: "#222",
                background: "#fff",
                outline: "none",
              }}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <input
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                height: 62,
                borderRadius: 12,
                border: "1.5px solid #ddd",
                padding: "0 16px",
                fontSize: 16,
                color: "#222",
                background: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <input
              placeholder="소속팀을 입력하세요"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              style={{
                height: 62,
                borderRadius: 12,
                border: "1.5px solid #ddd",
                padding: "0 16px",
                fontSize: 16,
                color: "#222",
                background: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <input
              placeholder="기록을 입력하세요 (횟수)"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveScore();
              }}
              style={{
                height: 62,
                borderRadius: 12,
                border: "1.5px solid #ddd",
                padding: "0 16px",
                fontSize: 16,
                color: "#222",
                background: "#fff",
                outline: "none",
                boxSizing: "border-box",
              }}
            />

            <button
              onClick={saveScore}
              style={{
                height: 62,
                border: "none",
                borderRadius: 12,
                background: "#ef1018",
                color: "#fff",
                fontSize: 15,
                fontWeight: 900,
                cursor: "pointer",
                boxShadow: "0 6px 14px rgba(239,16,24,0.18)",
                lineHeight: 1.2,
                padding: "0 8px",
                wordBreak: "keep-all",
              }}
            >
              ☑ 저장하기
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 12,
            }}
          >
            <button
              onClick={deleteAllScores}
              style={{
                height: 56,
                borderRadius: 12,
                border: "1px solid #ead9d9",
                background: "#ece5e5",
                color: "#d72c2c",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🗑 전체 기록 삭제
            </button>

            <button
              onClick={exportToExcel}
              style={{
                height: 56,
                borderRadius: 12,
                border: "1px solid #ead9d9",
                background: "#ece5e5",
                color: "#1f4aa8",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              📊 엑셀 다운로드
            </button>

            <button
              onClick={printPage}
              style={{
                height: 56,
                borderRadius: 12,
                border: "1px solid #ead9d9",
                background: "#ece5e5",
                color: "#444",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🖨 인쇄하기
            </button>

            <button
              onClick={() => setShowReplayOnly((prev) => !prev)}
              style={{
                height: 56,
                borderRadius: 12,
                border: "1px solid #ead9d9",
                background: "#ece5e5",
                color: "#8b1d1d",
                fontSize: 16,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              🎯 재경기 대상 보기
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 18,
            marginBottom: 18,
          }}
        >
          {categories.slice(0, 3).map((cat) => (
            <div
              key={cat}
              style={{
                background: "#f9f6f6",
                borderRadius: 24,
                padding: 22,
                boxShadow: "0 8px 24px rgba(162, 60, 24, 0.08)",
                border: "1px solid #eadede",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: categoryAccent[cat],
                  marginBottom: 16,
                }}
              >
                🏅 {cat}
              </div>

              <div
                style={{
                  borderTop: "1px solid #e5dddd",
                  marginBottom: 12,
                }}
              />

              <div style={{ minHeight: 360 }}>
                {groupedScores[cat].length === 0 ? (
                  <div style={{ color: "#777", fontSize: 16 }}>
                    아직 기록이 없습니다.
                  </div>
                ) : (
                  groupedScores[cat].slice(0, 8).map((item, index) => (
                    <div
                      key={item.id || `${cat}-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr auto",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 0",
                        borderBottom:
                          index === Math.min(groupedScores[cat].length, 8) - 1
                            ? "none"
                            : "1px solid #ece4e4",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#222",
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        {getMedalByRank(item.displayRank)}
                      </div>

                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {item.name}
                          {item.needsReplay && (
                            <span
                              style={{
                                color: "#ef1b22",
                                marginLeft: 6,
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              (재경기)
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#777",
                            marginTop: 2,
                            fontWeight: 600,
                          }}
                        >
                          {item.team || "-"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div>{item.score}회</div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#555",
                            marginTop: 2,
                          }}
                        >
                          {item.point}pt
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => deleteCategoryScores(cat)}
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 12,
                  border: `1.5px solid ${categoryAccent[cat]}`,
                  background: "#f9f6f6",
                  color: categoryAccent[cat],
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                  marginTop: 14,
                }}
              >
                🗑 이 종목 기록 삭제
              </button>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            maxWidth: 760,
            margin: "0 auto",
          }}
        >
          {categories.slice(3).map((cat) => (
            <div
              key={cat}
              style={{
                background: "#f9f6f6",
                borderRadius: 24,
                padding: 22,
                boxShadow: "0 8px 24px rgba(162, 60, 24, 0.08)",
                border: "1px solid #eadede",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: categoryAccent[cat],
                  marginBottom: 16,
                }}
              >
                🏅 {cat}
              </div>

              <div
                style={{
                  borderTop: "1px solid #e5dddd",
                  marginBottom: 12,
                }}
              />

              <div style={{ minHeight: 360 }}>
                {groupedScores[cat].length === 0 ? (
                  <div style={{ color: "#777", fontSize: 16 }}>
                    아직 기록이 없습니다.
                  </div>
                ) : (
                  groupedScores[cat].slice(0, 8).map((item, index) => (
                    <div
                      key={item.id || `${cat}-${index}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "44px 1fr auto",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 0",
                        borderBottom:
                          index === Math.min(groupedScores[cat].length, 8) - 1
                            ? "none"
                            : "1px solid #ece4e4",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#222",
                      }}
                    >
                      <div style={{ textAlign: "center" }}>
                        {getMedalByRank(item.displayRank)}
                      </div>

                      <div>
                        <div style={{ fontWeight: 800 }}>
                          {item.name}
                          {item.needsReplay && (
                            <span
                              style={{
                                color: "#ef1b22",
                                marginLeft: 6,
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              (재경기)
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#777",
                            marginTop: 2,
                            fontWeight: 600,
                          }}
                        >
                          {item.team || "-"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div>{item.score}회</div>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#555",
                            marginTop: 2,
                          }}
                        >
                          {item.point}pt
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => deleteCategoryScores(cat)}
                style={{
                  width: "100%",
                  height: 50,
                  borderRadius: 12,
                  border: `1.5px solid ${categoryAccent[cat]}`,
                  background: "#f9f6f6",
                  color: categoryAccent[cat],
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                  marginTop: 14,
                }}
              >
                🗑 이 종목 기록 삭제
              </button>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "#f9f6f6",
            borderRadius: 24,
            padding: 22,
            boxShadow: "0 8px 24px rgba(162, 60, 24, 0.08)",
            border: "1px solid #eadede",
            marginTop: 22,
          }}
        >
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "#e91b23",
              marginBottom: 16,
            }}
          >
            🏆 팀별 랭킹
          </div>

          <div
            style={{
              borderTop: "1px solid #e5dddd",
              marginBottom: 12,
            }}
          />

          {teamRankings.length === 0 ? (
            <div style={{ color: "#777", fontSize: 16 }}>
              아직 팀별 점수가 없습니다.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {teamRankings.map((item, index) => (
                <div
                  key={item.team}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr 120px",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 16px",
                    borderRadius: 14,
                    background:
                      index === 0
                        ? "#fff4cc"
                        : index === 1
                        ? "#f1f3f5"
                        : index === 2
                        ? "#ffe5d0"
                        : "#fff",
                    border: "1px solid #e8dede",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#222",
                  }}
                >
                  <div style={{ textAlign: "center" }}>
                    {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}`}
                  </div>
                  <div>{item.team}</div>
                  <div style={{ textAlign: "right" }}>{item.point}점</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showReplayOnly && (
          <div
            style={{
              background: "#fff7f7",
              borderRadius: 24,
              padding: 22,
              boxShadow: "0 8px 24px rgba(162, 60, 24, 0.08)",
              border: "1px solid #f0d6d6",
              marginTop: 22,
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 900,
                color: "#e91b23",
                marginBottom: 16,
              }}
            >
              🎯 재경기 대상
            </div>

            {replayCandidates.length === 0 ? (
              <div style={{ color: "#777", fontSize: 16 }}>
                현재 재경기 대상이 없습니다.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {replayCandidates.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "170px 1fr 1fr 120px 160px",
                      gap: 10,
                      alignItems: "center",
                      padding: "14px 16px",
                      borderRadius: 14,
                      background: "#fff",
                      border: "1px solid #ecdede",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#e91b23" }}>
                      {item.category}
                    </div>
                    <div>{item.name}</div>
                    <div>{item.team}</div>
                    <div>{item.score}회</div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number"
                        placeholder="재경기"
                        value={replayInputs[item.id || ""] || ""}
                        onChange={(e) =>
                          setReplayInputs((prev) => ({
                            ...prev,
                            [item.id || ""]: e.target.value,
                          }))
                        }
                        onKeyDown={async (e) => {
                          if (e.key === "Enter") {
                            const value = Number(
                              replayInputs[item.id || ""] || ""
                            );
                            if (!isNaN(value)) {
                              await saveReplayScore(item.id!, value);
                            }
                          }
                        }}
                        style={{
                          width: 80,
                          height: 38,
                          borderRadius: 8,
                          border: "1px solid #ddd",
                          padding: "0 10px",
                        }}
                      />

                      <button
                        onClick={async () => {
                          const value = Number(replayInputs[item.id || ""] || "");
                          if (!isNaN(value)) {
                            await saveReplayScore(item.id!, value);
                          }
                        }}
                        style={{
                          height: 38,
                          borderRadius: 8,
                          border: "none",
                          background: "#ef1018",
                          color: "#fff",
                          padding: "0 12px",
                          cursor: "pointer",
                          fontWeight: 800,
                        }}
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          style={{
            marginTop: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 8px",
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              fontStyle: "italic",
              background: "linear-gradient(90deg, #ff0f1f 0%, #ff9b18 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            JumpOne
          </div>

          <div style={{ color: "#ffffff", fontSize: 16 }}>
            © 2024 JumpOne. All rights reserved.
          </div>
        </div>

        {loading && (
          <div
            style={{
              position: "fixed",
              right: 20,
              bottom: 20,
              background: "#111",
              color: "#fff",
              padding: "10px 14px",
              borderRadius: 12,
              fontSize: 14,
            }}
          >
            불러오는 중...
          </div>
        )}
      </div>
    </div>
  );
}
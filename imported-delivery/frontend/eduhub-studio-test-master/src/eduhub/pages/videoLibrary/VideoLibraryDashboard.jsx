/**
 * VideoLibraryDashboard.jsx — the Video Library's premium streaming-style
 * landing page: identity welcome header (avatar, name, EduHub Points, tier),
 * search, level tabs, sort, category chips, and marketplace rails —
 * Continue Learning, Recommended For You (watch-history affinity, computed
 * client-side from real progress/bookmarks — never fabricated), Featured,
 * Recently Watched, New Releases, My Lessons, Bookmarks, and one rail per
 * backend category. Data comes from a handful of composable endpoints and
 * is grouped client-side, matching this codebase's convention.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clapperboard, Sparkles, Search, X, Crown, ArrowDownWideNarrow, Play, AudioLines, ArrowRight, Target, TrendingUp } from "lucide-react";
import { listLessons, listContinueWatching, listBookmarks, listRecentlyWatched, listMyPurchases, getRestrictedPointsBalance } from "./videoLibraryApi";
import LessonCard, { LessonCardSkeleton, CATEGORY_LABELS } from "./LessonCard";
import { useAuth } from "../../context/AuthContext";
import EduHubPointsPill from "../../components/points/EduHubPointsPill";
import VideoLibraryCouponCard from "./VideoLibraryCouponCard";
import AvailableCouponsPanel from "./AvailableCouponsPanel";
import "./videoLibrary.css";

const GOLD = "#D4A843";

const DIFFICULTY_TABS = [
  { key: "", label: "All" },
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
];

const CATEGORY_ROWS = [
  { key: "storytelling", label: "Storytelling" },
  { key: "conversation", label: "Conversation Practice" },
  { key: "business", label: "Business English" },
  { key: "ielts", label: "IELTS Preparation" },
  { key: "pronunciation", label: "Pronunciation" },
  { key: "grammar", label: "Grammar" },
  { key: "vocabulary", label: "Vocabulary" },
  { key: "listening", label: "Listening" },
  { key: "speaking", label: "Speaking" },
];

const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "title", label: "A – Z" },
  { key: "priceAsc", label: "Price ↑" },
  { key: "priceDesc", label: "Price ↓" },
  { key: "duration", label: "Shortest" },
];

function WelcomeHeader({ student, continueCount }) {
  const name = student?.name || student?.gameName || student?.display_name || "Learner";
  const rawPoints = student?.points ?? student?.portalPoints ?? student?.portalData?.Points ?? student?.gamePoints;
  const points = Number.isFinite(Number(rawPoints)) && rawPoints !== null && rawPoints !== undefined && rawPoints !== ""
    ? Number(rawPoints) : null;
  const tier = student?.tier || student?.portalData?.Tier || (student ? "Member" : null);
  const initials = String(name).split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  // §2.7: restricted points are a genuinely different balance (Video-
  // Library-only, spent before general points on a purchase) — surfaced
  // as its OWN badge, never merged into the general EduHubPointsPill
  // above, so the student understands these are earmarked. Self-fetched
  // (mirrors VideoLibraryCouponCard's own self-contained status check)
  // rather than threaded through as a prop, and hidden entirely at 0 so
  // the overwhelming majority of students (who have never redeemed a
  // Video Library points coupon) see nothing extra here.
  const [restrictedBalance, setRestrictedBalance] = useState(0);
  useEffect(() => {
    let cancelled = false;
    getRestrictedPointsBalance().then((bal) => { if (!cancelled) setRestrictedBalance(bal); });
    return () => { cancelled = true; };
  }, []);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <header className="vl-discovery-header vl-rise" data-testid="video-library-welcome">
      <div className="vl-brand-row">
        <div className="vl-brand-lockup">
          <span className="vl-brand-mark" aria-hidden="true"><Play size={20} fill="currentColor" /></span>
          <span>
            <strong>Video Library</strong>
            <small>Your speaking practice</small>
          </span>
        </div>
        <div className="vl-identity-actions">
          {points !== null && <EduHubPointsPill value={points} size="sm" testId="video-library-points-badge" />}
          <div className="vl-avatar" data-testid="video-library-avatar">
            {student?.avatar_url
              ? <img src={student.avatar_url} alt="" />
              : initials || "?"}
          </div>
        </div>
      </div>
      <div className="vl-welcome-copy">
        <div>
          <p>{greeting}, <span data-testid="video-library-student-name">{name}</span></p>
          <h1>What will you unlock today?</h1>
        </div>
        <div className="vl-welcome-badges vl-row-scroll">
          {restrictedBalance > 0 && (
            <span data-testid="video-library-restricted-points-badge" title="Earmarked for Video Library purchases only">
              +{restrictedBalance} Video pts
            </span>
          )}
          {tier && <span data-testid="video-library-tier-badge"><Crown size={11} /> {tier}</span>}
          {continueCount > 0 && <span><Sparkles size={11} /> {continueCount} active</span>}
          <VideoLibraryCouponCard />
        </div>
      </div>
    </header>
  );
}

function Row({ title, lessons, progressByLesson, onOpen, testId, index = 0 }) {
  if (!lessons || lessons.length === 0) return null;
  return (
    <section className="space-y-2.5 vl-rise" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }} data-testid={testId}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 px-4 sm:px-6">
        <h2 className="min-w-0 truncate text-[15px] font-bold text-zinc-800 dark:text-white">{title}</h2>
        <ArrowRight size={15} className="shrink-0 text-zinc-400 dark:text-white/30" aria-hidden="true" />
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 sm:px-6 pb-1 vl-row-scroll">
        {lessons.map((lesson) => (
          <LessonCard key={lesson.lessonId} lesson={lesson}
                      progressFraction={progressByLesson[lesson.lessonId]} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function Spotlight({ lesson, progressFraction, onOpen }) {
  if (!lesson) return null;
  const percent = Math.round(Math.min(1, Math.max(0, progressFraction || 0)) * 100);
  return (
    <section className="vl-spotlight mx-4 sm:mx-6 mb-7" data-testid="video-library-spotlight">
      {lesson.thumbnailUrl && <img src={lesson.thumbnailUrl} alt="" className="vl-spotlight-image" />}
      <div className="vl-spotlight-shade" />
      <div className="vl-spotlight-copy">
        <div className="vl-spotlight-kicker"><Sparkles size={12} /> Your next speaking moment</div>
        <h2>{lesson.title}</h2>
        {(lesson.subtitle || lesson.description) && <p>{lesson.subtitle || lesson.description}</p>}
        <div className="vl-spotlight-meta">
          {lesson.difficulty && <span>{DIFFICULTY_TABS.find((item) => item.key === lesson.difficulty)?.label}</span>}
          {lesson.syncId && <span><AudioLines size={11} /> Precision word sync</span>}
          {percent > 0 && <span>{percent}% complete</span>}
        </div>
        <button type="button" onClick={() => onOpen(lesson)} className="vl-spotlight-action">
          <Play size={16} fill="currentColor" /> {percent > 0 ? "Continue shadowing" : "Start lesson"}
        </button>
      </div>
      {percent > 0 && <div className="vl-spotlight-progress"><span style={{ width: `${percent}%` }} /></div>}
    </section>
  );
}

function AdaptivePath({ currentLesson, currentProgress, recommendedLesson }) {
  const percent = Math.round(Math.min(1, Math.max(0, currentProgress || 0)) * 100);
  if (!currentLesson && !recommendedLesson) return null;
  return (
    <section className="vl-adaptive" data-testid="video-library-adaptive-path">
      <div className="vl-section-heading">
        <h2>Your adaptive path</h2>
        <span>Based on your learning</span>
      </div>
      <div className="vl-adaptive-grid">
        {currentLesson && percent > 0 && (
          <article className="vl-insight vl-insight-primary">
            <span className="vl-insight-icon"><Target size={17} /></span>
            <strong>{percent}%</strong>
            <h3>Keep your momentum</h3>
            <p>Continue “{currentLesson.title}” from where you stopped.</p>
          </article>
        )}
        {recommendedLesson && (
          <article className="vl-insight">
            <span className="vl-insight-icon"><TrendingUp size={17} /></span>
            <strong>Next</strong>
            <h3>Build speaking flow</h3>
            <p>{CATEGORY_LABELS[recommendedLesson.category] || "A new lesson"} matches your recent practice.</p>
          </article>
        )}
      </div>
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-7" data-testid="video-library-skeleton">
      {[0, 1].map((r) => (
        <section key={r} className="space-y-2.5">
          <div className="h-3.5 w-40 rounded vl-skeleton mx-4 sm:mx-6" />
          <div className="flex gap-3 overflow-hidden px-4 sm:px-6">
            {[0, 1, 2, 3, 4].map((i) => <LessonCardSkeleton key={i} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Recommended For You — affinity from what the student actually watched /
 * bookmarked (categories + difficulties), scoring unwatched lessons. Pure
 * client-side heuristic over real signals; empty history ⇒ hidden row. */
function computeRecommended(lessons, progress, bookmarks) {
  const seen = new Set([...progress.map((p) => p.lessonId), ...bookmarks.map((b) => b.lessonId)]);
  if (seen.size === 0) return [];
  const byId = Object.fromEntries(lessons.map((l) => [l.lessonId, l]));
  const catScore = {}; const diffScore = {};
  for (const id of seen) {
    const l = byId[id];
    if (!l) continue;
    if (l.category) catScore[l.category] = (catScore[l.category] || 0) + 1;
    if (l.difficulty) diffScore[l.difficulty] = (diffScore[l.difficulty] || 0) + 1;
  }
  return lessons
    .filter((l) => !seen.has(l.lessonId))
    .map((l) => ({ l, score: (catScore[l.category] || 0) * 2 + (diffScore[l.difficulty] || 0) + (l.featured ? 0.5 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((x) => x.l);
}

export default function VideoLibraryDashboard() {
  const navigate = useNavigate();
  // Optional auth context — the dashboard renders a graceful anonymous
  // header when mounted outside <AuthProvider> (component tests, previews).
  let student = null;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  try { student = useAuth().student; } catch { /* no provider */ }
  const [lessons, setLessons] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [recentlyWatched, setRecentlyWatched] = useState([]);
  const [myPurchases, setMyPurchases] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [difficulty, setDifficulty] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const load = useCallback(async (diff, q) => {
    setError(null);
    try {
      const [lessonList, progressList, recentList, purchaseList, bookmarkList] = await Promise.all([
        listLessons({ ...(diff ? { difficulty: diff } : {}), ...(q ? { q } : {}) }),
        listContinueWatching(),
        listRecentlyWatched(),
        listMyPurchases(),
        listBookmarks(),
      ]);
      setLessons(lessonList);
      setContinueWatching(progressList);
      setRecentlyWatched(recentList);
      setMyPurchases(purchaseList);
      setBookmarks(bookmarkList);
    } catch (e) {
      setError(e.message || "Could not load the Video Library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(difficulty, query.trim()), query ? 350 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [difficulty, query, load]);

  const sortedLessons = useMemo(() => {
    const base = categoryFilter ? lessons.filter((l) => l.category === categoryFilter) : lessons;
    const out = [...base];
    if (sort === "title") out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    else if (sort === "priceAsc") out.sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sort === "priceDesc") out.sort((a, b) => (b.price || 0) - (a.price || 0));
    else if (sort === "duration") out.sort((a, b) => (a.durationSec || 0) - (b.durationSec || 0));
    else out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return out;
  }, [lessons, categoryFilter, sort]);

  const progressByLesson = useMemo(() => {
    const out = {};
    for (const p of continueWatching) {
      if (p.durationSec > 0) out[p.lessonId] = p.positionSec / p.durationSec;
    }
    return out;
  }, [continueWatching]);

  const lessonsById = useMemo(() => {
    const out = {};
    for (const l of lessons) out[l.lessonId] = l;
    return out;
  }, [lessons]);

  const continueWatchingLessons = useMemo(
    () => continueWatching.map((p) => lessonsById[p.lessonId]).filter(Boolean),
    [continueWatching, lessonsById],
  );
  const recentlyWatchedLessons = useMemo(
    () => recentlyWatched.map((p) => lessonsById[p.lessonId]).filter(Boolean).slice(0, 12),
    [recentlyWatched, lessonsById],
  );
  const bookmarkedLessons = useMemo(
    () => bookmarks.map((b) => lessonsById[b.lessonId]).filter(Boolean),
    [bookmarks, lessonsById],
  );
  const myPurchasedLessons = useMemo(
    () => myPurchases.filter((p) => p.state === "succeeded").map((p) => lessonsById[p.lessonId]).filter(Boolean),
    [myPurchases, lessonsById],
  );
  const recommended = useMemo(
    () => computeRecommended(sortedLessons, recentlyWatched, bookmarks),
    [sortedLessons, recentlyWatched, bookmarks],
  );
  const featured = useMemo(() => sortedLessons.filter((l) => l.featured), [sortedLessons]);
  const newReleases = useMemo(
    () => [...sortedLessons].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 10),
    [sortedLessons],
  );

  const openLesson = (lesson) => navigate(`/video-library/watch/${lesson.lessonId}`);
  const isFilteredView = Boolean(categoryFilter || query.trim());
  const spotlightLesson = continueWatchingLessons[0] || recommended[0] || featured[0] || sortedLessons[0];
  let rowIdx = 0;

  return (
    <div className="vl-dashboard pb-10" data-testid="video-library-dashboard">
      <WelcomeHeader student={student} continueCount={continueWatchingLessons.length} />

      <div className="px-4 sm:px-6">
        <AvailableCouponsPanel />
      </div>

      {/* Search + sort */}
      <div className="vl-discovery-controls">
        <div className="vl-search-wrap">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lessons, vocabulary, expressions…"
            data-testid="video-library-search-input"
            className="vl-search-input"
          />
          {query && (
            <button onClick={() => setQuery("")} data-testid="video-library-search-clear"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-white/40">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="vl-sort-wrap">
          <ArrowDownWideNarrow size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400 dark:text-white/40" />
          <select value={sort} onChange={(e) => setSort(e.target.value)}
                  data-testid="video-library-sort-select"
                  className="vl-sort-select" aria-label="Sort lessons">
            {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Level tabs */}
      <div className="vl-filter-row vl-filter-row-primary vl-row-scroll">
        {DIFFICULTY_TABS.map((tab) => (
          <button
            key={tab.key || "all"}
            onClick={() => setDifficulty(tab.key)}
            data-testid={`video-library-difficulty-tab-${tab.key || "all"}`}
            className={`vl-chip ${difficulty === tab.key ? "is-active" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Category chips */}
      <div className="vl-filter-row vl-filter-row-secondary vl-row-scroll">
        <button onClick={() => setCategoryFilter("")}
                data-testid="video-library-category-chip-all"
                className={`vl-chip ${!categoryFilter ? "is-active" : ""}`}>
          All topics
        </button>
        {CATEGORY_ROWS.map((c) => (
          <button key={c.key} onClick={() => setCategoryFilter(categoryFilter === c.key ? "" : c.key)}
                  data-testid={`video-library-category-chip-${c.key}`}
                  className={`vl-chip ${categoryFilter === c.key ? "is-active" : ""}`}>
            {CATEGORY_LABELS[c.key]}
          </button>
        ))}
      </div>

      {!loading && !isFilteredView && (
        <>
          <Spotlight lesson={spotlightLesson} progressFraction={spotlightLesson ? progressByLesson[spotlightLesson.lessonId] : 0} onOpen={openLesson} />
          <AdaptivePath
            currentLesson={continueWatchingLessons[0]}
            currentProgress={continueWatchingLessons[0] ? progressByLesson[continueWatchingLessons[0].lessonId] : 0}
            recommendedLesson={recommended[0]}
          />
        </>
      )}

      {error && (
        <div className="mx-4 sm:mx-6 mb-4 text-[13px] text-red-400" data-testid="video-library-error">
          {error}
        </div>
      )}

      {loading ? (
        <SkeletonRows />
      ) : sortedLessons.length === 0 ? (
        <div className="mx-4 sm:mx-6 rounded-xl border border-dashed border-white/10 p-8 text-center vl-rise">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
               style={{ background: "rgba(212,168,67,0.10)" }}>
            <Clapperboard size={20} style={{ color: GOLD }} />
          </div>
          <div className="text-[14px] font-semibold text-ink dark:text-white mb-1">
            {query.trim() ? "No lessons match your search" : categoryFilter ? "No lessons match" : "No lessons published yet"}
          </div>
          <div className="text-[12.5px] text-zinc-500 dark:text-white/50">
            {isFilteredView ? "Try a different word, level, or topic." : "Check back soon — new video lessons are added regularly."}
          </div>
        </div>
      ) : isFilteredView ? (
        /* Filtered/search view: one flat grid, sorted */
        <div className="px-4 sm:px-6 vl-rise">
          <div className="text-[12px] text-zinc-500 dark:text-white/50 mb-3" data-testid="video-library-results-count">
            {sortedLessons.length} lesson{sortedLessons.length > 1 ? "s" : ""}
            {categoryFilter ? ` in ${CATEGORY_LABELS[categoryFilter]}` : ""}
          </div>
          <div className="flex flex-wrap gap-3" data-testid="video-library-filtered-grid">
            {sortedLessons.map((lesson) => (
              <LessonCard key={lesson.lessonId} lesson={lesson}
                          progressFraction={progressByLesson[lesson.lessonId]} onOpen={openLesson} />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <Row title="Continue Learning" lessons={continueWatchingLessons} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-continue" index={rowIdx++} />
          <Row title="Recommended For You" lessons={recommended} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-recommended" index={rowIdx++} />
          <Row title="Featured Lessons" lessons={featured} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-featured" index={rowIdx++} />
          <Row title="Recently Watched" lessons={recentlyWatchedLessons} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-recent" index={rowIdx++} />
          <Row title="New Releases" lessons={newReleases} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-new" index={rowIdx++} />
          <Row title="My Lessons" lessons={myPurchasedLessons} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-my-lessons" index={rowIdx++} />
          <Row title="My Bookmarks" lessons={bookmarkedLessons} progressByLesson={progressByLesson} onOpen={openLesson} testId="video-library-row-bookmarks" index={rowIdx++} />
          {CATEGORY_ROWS.map((row) => (
            <Row key={row.key} title={row.label}
                 lessons={sortedLessons.filter((l) => l.category === row.key)}
                 progressByLesson={progressByLesson} onOpen={openLesson}
                 testId={`video-library-row-${row.key}`} index={rowIdx++} />
          ))}
        </div>
      )}
    </div>
  );
}

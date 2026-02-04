import { db } from "../firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  CollectionReference,
  DocumentReference,
} from "firebase/firestore";

// =======================
// Types
// =======================

export type Chapter = {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
};

/** Lightweight chapter info for lists/TOC (no content). */
export type ChapterMeta = {
  id: string;
  num: number;
  title: string;
  updatedAt: number;
};

export type Story = {
  id: string;
  title: string;
  author?: string;
  description?: string;
  updatedAt: number;
};

// =======================
// Helpers
// =======================

type StoryId = string | number;

function sid(storyId: StoryId): string {
  return String(storyId);
}

// =======================
// Paths
// =======================

function storyRef(storyId: StoryId): DocumentReference {
  return doc(db, "stories", sid(storyId));
}

function chaptersCol(storyId: StoryId): CollectionReference {
  return collection(db, "stories", sid(storyId), "chapters");
}

function chaptersMetaCol(storyId: StoryId): CollectionReference {
  return collection(db, "stories", sid(storyId), "chaptersMeta");
}

function chapterRef(storyId: StoryId, chapterId: string): DocumentReference {
  return doc(db, "stories", sid(storyId), "chapters", chapterId);
}

function chapterMetaRef(storyId: StoryId, chapterId: string): DocumentReference {
  return doc(db, "stories", sid(storyId), "chaptersMeta", chapterId);
}

// =======================
// Env assert (optional)
// =======================

function assertString(name: string, value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`[db] Invalid value for ${name}`);
  }
}

// =======================
// Story
// =======================

export async function getStory(storyId: StoryId): Promise<Story | null> {
  console.log("=== DEBUG getStory ===");
  console.log("storyId:", storyId);
  console.log("sid(storyId):", sid(storyId));
  console.log("db:", db);
  
  const ref = storyRef(storyId);
  console.log("ref.path:", ref.path);
  
  try {
    console.log("⏳ Calling getDoc with 10s timeout...");
    
    const snap = await Promise.race([
      getDoc(ref),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error("❌ Timeout: getDoc took longer than 10 seconds")), 10000)
      )
    ]) as any;
    
    console.log("✅ getDoc returned!");
    console.log("snap.exists():", snap.exists());
    console.log("snap.id:", snap.id);
    console.log("snap.data():", snap.data());
    
    if (!snap.exists()) {
      console.log("❌ Document does not exist!");
      return null;
    }
    
    const data = snap.data() as any;

    const result = {
      id: snap.id,
      title: data.title ?? "",
      author: data.author ?? "",
      description: data.description ?? "",
      updatedAt: data.updatedAt ?? 0,
    };
    
    console.log("✅ Returning story:", result);
    return result;
  } catch (error) {
    console.error("❌ Error in getStory:", error);
    
    // Thử lại 1 lần nữa
    console.log("🔄 Retrying once...");
    try {
      const snap = await getDoc(ref);
      console.log("✅ Retry successful! snap.exists():", snap.exists());
      
      if (!snap.exists()) return null;
      
      const data = snap.data() as any;
      return {
        id: snap.id,
        title: data.title ?? "",
        author: data.author ?? "",
        description: data.description ?? "",
        updatedAt: data.updatedAt ?? 0,
      };
    } catch (retryError) {
      console.error("❌ Retry also failed:", retryError);
      throw retryError;
    }
  }
}

export async function upsertStory(story: Story) {
  assertString("story.id", story.id);

  await setDoc(
    storyRef(story.id),
    {
      title: story.title,
      author: story.author ?? "",
      description: story.description ?? "",
      updatedAt: story.updatedAt ?? Date.now(),
    },
    { merge: true }
  );
}

// =======================
// Chapters
// =======================

/**
 * ✅ Chapters list for UI (Home/TOC) – does NOT download content.
 *
 * Uses: stories/{storyId}/chaptersMeta/{chapterId}
 * Backward-compat: if meta is empty, falls back to old `chapters` (will be heavy until migrated).
 */
export async function getChapterMetas(storyId: StoryId): Promise<ChapterMeta[]> {
  const metaQ = query(chaptersMetaCol(storyId), orderBy("num", "asc"));
  const metaSnap = await getDocs(metaQ);

  if (!metaSnap.empty) {
    return metaSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        num: Number(data.num ?? Number(d.id) ?? 0),
        title: data.title ?? "",
        updatedAt: data.updatedAt ?? 0,
      };
    });
  }

  // ⚠️ fallback (legacy schema)
  const legacyQ = query(chaptersCol(storyId), orderBy("num", "asc"));
  const legacySnap = await getDocs(legacyQ);
  return legacySnap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      num: Number(data.num ?? Number(d.id) ?? 0),
      title: data.title ?? "",
      updatedAt: data.updatedAt ?? 0,
    };
  });
}

/** Legacy: full chapters (downloads content). Prefer `getChapterMetas` + `getChapter`. */
export async function getChapters(storyId: StoryId): Promise<Chapter[]> {
  const qy = query(chaptersCol(storyId), orderBy("num", "asc"));
  const snap = await getDocs(qy);
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      id: d.id,
      title: data.title ?? "",
      content: data.content ?? "",
      updatedAt: data.updatedAt ?? 0,
    };
  });
}

export async function getChapter(
  storyId: StoryId,
  chapterId: string
): Promise<Chapter | null> {
  // Prefer split storage (content in chapters, title in chaptersMeta)
  const [contentSnap, metaSnap] = await Promise.all([
    getDoc(chapterRef(storyId, chapterId)),
    getDoc(chapterMetaRef(storyId, chapterId)),
  ]);

  // Legacy single-doc schema (or missing)
  if (!contentSnap.exists() && !metaSnap.exists()) return null;

  const contentData = (contentSnap.exists() ? contentSnap.data() : {}) as any;
  const metaData = (metaSnap.exists() ? metaSnap.data() : {}) as any;

  const title = metaData.title ?? contentData.title ?? "";
  const updatedAt = metaData.updatedAt ?? contentData.updatedAt ?? 0;
  const content = contentData.content ?? "";

  return { id: chapterId, title, content, updatedAt };
}

export async function upsertChapter(
  storyId: StoryId,
  chapter: { id: string; title: string; content: string }
) {
  const now = Date.now();
  const num = Number(chapter.id) || 0;

  // Store meta + content separately to avoid downloading all contents for lists.
  await Promise.all([
    setDoc(
      chapterMetaRef(storyId, chapter.id),
      {
        id: chapter.id,
        num,
        title: chapter.title,
        updatedAt: now,
      },
      { merge: true }
    ),
    setDoc(
      chapterRef(storyId, chapter.id),
      {
        id: chapter.id,
        num,
        // keep title for backward-compat/search convenience (optional)
        title: chapter.title,
        content: chapter.content,
        updatedAt: now,
      },
      { merge: true }
    ),
  ]);

  // bump story.updatedAt
  await setDoc(storyRef(storyId), { updatedAt: now }, { merge: true });
}

/** ✅ realtime listen chapter metas (no content) */
export function listenChapterMetas(
  storyId: StoryId,
  cb: (chs: ChapterMeta[]) => void
): () => void {
  const qy = query(chaptersMetaCol(storyId), orderBy("num", "asc"));

  const unsub = onSnapshot(qy, async (snap) => {
    if (!snap.empty) {
      const chs: ChapterMeta[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          num: Number(data.num ?? Number(d.id) ?? 0),
          title: data.title ?? "",
          updatedAt: data.updatedAt ?? 0,
        };
      });
      cb(chs);
      return;
    }

    // ⚠️ fallback for legacy schema
    const legacy = await getChapterMetas(storyId);
    cb(legacy);
  });

  return unsub;
}

/** ✅ batch import (Admin dùng cái này) */
export async function batchUpsertChapters(
  storyId: StoryId,
  chapters: Array<{ id: string; title: string; content: string }>
) {
  const now = Date.now();

  // Firestore batch limit ~500 ops → chunk to be safe.
  // Each chapter writes 2 docs (meta + content). We'll keep a comfortable margin.
  const OPS_PER_CHAPTER = 2;
  const MAX_OPS = 450;
  const CHUNK_SIZE = Math.max(1, Math.floor(MAX_OPS / OPS_PER_CHAPTER));

  for (let i = 0; i < chapters.length; i += CHUNK_SIZE) {
    const slice = chapters.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const ch of slice) {
      const num = Number(ch.id) || 0;

      batch.set(
        chapterMetaRef(storyId, ch.id),
        { id: ch.id, num, title: ch.title, updatedAt: now },
        { merge: true }
      );
      batch.set(
        chapterRef(storyId, ch.id),
        { id: ch.id, num, title: ch.title, content: ch.content, updatedAt: now },
        { merge: true }
      );
    }

    // bump story.updatedAt in the last batch only (1 op)
    if (i + CHUNK_SIZE >= chapters.length) {
      batch.set(storyRef(storyId), { updatedAt: now }, { merge: true });
    }

    await batch.commit();
  }
}

// =======================
// Delete
// =======================

export async function deleteChapter(storyId: StoryId, chapterId: string) {
  await Promise.all([
    deleteDoc(chapterRef(storyId, chapterId)),
    deleteDoc(chapterMetaRef(storyId, chapterId)),
  ]);
  await setDoc(storyRef(storyId), { updatedAt: Date.now() }, { merge: true });
}

export async function deleteAllChapters(storyId: StoryId) {
  // Delete both content + meta collections, paged by 500.
  async function deletePaged(col: CollectionReference) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const qy = query(col, limit(500));
      const snap = await getDocs(qy);
      if (snap.empty) break;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }

  await deletePaged(chaptersCol(storyId));
  await deletePaged(chaptersMetaCol(storyId));

  await setDoc(storyRef(storyId), { updatedAt: Date.now() }, { merge: true });
}

// =======================
// Migration helper (optional)
// =======================

/**
 * One-time migration helper:
 * If you already have legacy chapters (title+content in one doc), this creates `chaptersMeta`.
 * Call from Admin when you need it.
 */
export async function migrateCreateChapterMetasFromLegacy(storyId: StoryId) {
  const metas = await getChapterMetas(storyId);
  if (metas.length > 0) return; // already migrated

  const legacy = await getChapters(storyId); // ⚠️ downloads all content once
  const now = Date.now();

  const CHUNK_SIZE = 450;
  for (let i = 0; i < legacy.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const slice = legacy.slice(i, i + CHUNK_SIZE);
    for (const ch of slice) {
      const num = Number(ch.id) || 0;
      batch.set(
        chapterMetaRef(storyId, ch.id),
        { id: ch.id, num, title: ch.title, updatedAt: ch.updatedAt ?? now },
        { merge: true }
      );
    }
    await batch.commit();
  }
}
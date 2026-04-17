import assert from "node:assert/strict";
import { dataService } from "../src/services/dataService";

type MemoryStore = Map<string, string>;

function createMemoryStorage(store: MemoryStore): Storage {
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const yesterdayPayload = {
  lastUpdated: "2026-04-17T00:00:00Z",
  games: [
    {
      id: "old-game",
      title: "Old Game",
      category: "Action",
      rating: 4.2,
      description: "Existing game from yesterday.",
      bannerImage: "https://example.com/old-game-banner.jpg",
      thumbnailImage: "https://example.com/old-game-thumb.jpg",
      executable: "",
      translations: [
        {
          id: "old-game-ar-v1",
          name: "Arabic Pack",
          version: "1.0.0",
          type: "community",
          description: "Arabic patch.",
          releaseDate: "2026-04-17",
          downloadUrl: "https://example.com/old-game.zip",
          changelog: ["Initial release"],
          size: "10 MB",
          author: "Polar Team",
        },
      ],
    },
  ],
};

const todayPayload = {
  ...yesterdayPayload,
  lastUpdated: "2026-04-18T00:00:00Z",
  games: [
    ...yesterdayPayload.games,
    {
      id: "new-game-today",
      title: "New Game Today",
      category: "Adventure",
      rating: 4.6,
      description: "New game added to Cloudflare today.",
      bannerImage: "https://example.com/new-game-banner.jpg",
      thumbnailImage: "https://example.com/new-game-thumb.jpg",
      executable: "",
      translations: [
        {
          id: "new-game-today-ar-v1",
          name: "Arabic Pack",
          version: "1.0.0",
          type: "community",
          description: "Arabic patch.",
          releaseDate: "2026-04-18",
          downloadUrl: "https://example.com/new-game.zip",
          changelog: ["Initial release"],
          size: "9 MB",
          author: "Polar Team",
        },
      ],
    },
  ],
};

async function main() {
  const storageMap: MemoryStore = new Map();
  const storage = createMemoryStorage(storageMap);
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  let remoteCall = 0;
  const remoteQueue: Array<unknown> = [yesterdayPayload, todayPayload];
  const fetchMock: typeof fetch = async () => {
    const payload = remoteQueue[Math.min(remoteCall, remoteQueue.length - 1)];
    remoteCall += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  Object.defineProperty(globalThis, "fetch", {
    value: fetchMock,
    configurable: true,
    writable: true,
  });

  // Simulate user who installed yesterday and launches app (day 1 data).
  const day1Result = await dataService.fetchData();
  assert.equal(day1Result.source, "remote");
  assert.equal(day1Result.data.games.length, 1);
  assert.equal(day1Result.data.games[0]?.id, "old-game");

  // Simulate same installed app launched next day after Cloudflare update.
  const day2Result = await dataService.fetchData();
  assert.equal(day2Result.source, "remote");
  assert.equal(day2Result.data.games.length, 2);
  assert.ok(day2Result.data.games.some((game) => game.id === "new-game-today"));

  // Simulate temporary offline scenario -> must use local cache with day2 data.
  const offlineFetch: typeof fetch = async () => {
    throw new Error("network unavailable");
  };
  Object.defineProperty(globalThis, "fetch", {
    value: offlineFetch,
    configurable: true,
    writable: true,
  });

  const offlineResult = await dataService.fetchData();
  assert.equal(offlineResult.source, "cache");
  assert.equal(offlineResult.data.games.length, 2);
  assert.ok(offlineResult.data.games.some((game) => game.id === "new-game-today"));

  console.log("Existing-user content update flow verified successfully.");
}

await main();

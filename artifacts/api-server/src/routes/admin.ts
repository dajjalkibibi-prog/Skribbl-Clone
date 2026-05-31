import { Router, type Request, type Response } from "express";
import { getLog } from "../lib/activityLog";
import { hasDb, getDb, activityLogTable } from "@workspace/db";
import { sql, count, desc } from "drizzle-orm";

const ADMIN_KEY = "eonmaster6767";

const router = Router();

router.get("/admin", async (req: Request, res: Response) => {
  if (req.query["key"] !== ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const log = await getLog();

  let topIps: { ip: string; count: number }[] = [];
  let topPlayers: { username: string; count: number }[] = [];
  let actionCounts: Record<string, number> = {};
  let todayCount = 0;

  if (hasDb()) {
    try {
      const db = getDb();

      const ipRows = await db
        .select({ ip: activityLogTable.ip, cnt: count() })
        .from(activityLogTable)
        .groupBy(activityLogTable.ip)
        .orderBy(desc(count()))
        .limit(20);
      topIps = ipRows.map(r => ({ ip: r.ip, count: Number(r.cnt) }));

      const playerRows = await db
        .select({ username: activityLogTable.username, cnt: count() })
        .from(activityLogTable)
        .where(sql`${activityLogTable.action} != 'page_visit'`)
        .groupBy(activityLogTable.username)
        .orderBy(desc(count()))
        .limit(20);
      topPlayers = playerRows.map(r => ({ username: r.username, count: Number(r.cnt) }));

      const actionRows = await db
        .select({ action: activityLogTable.action, cnt: count() })
        .from(activityLogTable)
        .groupBy(activityLogTable.action);
      for (const r of actionRows) actionCounts[r.action] = Number(r.cnt);

      const todayRows = await db
        .select({ cnt: count() })
        .from(activityLogTable)
        .where(sql`${activityLogTable.time} >= NOW() - INTERVAL '24 hours'`);
      todayCount = Number(todayRows[0]?.cnt ?? 0);
    } catch (_) {}
  }

  const suspiciousIps = topIps
    .filter(({ ip }) => {
      const names = new Set(log.filter(e => e.ip === ip && e.username !== 'visitor').map(e => e.username));
      return names.size >= 3;
    })
    .map(({ ip }) => {
      const names = [...new Set(log.filter(e => e.ip === ip && e.username !== 'visitor').map(e => e.username))];
      const evCount = log.filter(e => e.ip === ip).length;
      return { ip, usernames: names, count: evCount };
    });

  res.json({ log, topIps, topPlayers, actionCounts, todayCount, suspiciousIps });
});

export default router;

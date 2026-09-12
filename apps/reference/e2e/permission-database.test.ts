import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { setPermission } from "./permission-database";

test("waits for a live BFF write lock before changing permission state", async () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "oui-permission-lock-"));
  const databasePath = join(temporaryRoot, "reference.db");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE permissions(
      actor_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      PRIMARY KEY(actor_id, permission)
    );
    INSERT INTO permissions(actor_id, permission)
      VALUES('uat-actor', 'items.update');
  `);
  database.close();

  const blocker = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
        import { DatabaseSync } from "node:sqlite";
        const database = new DatabaseSync(process.env.OUI_LOCK_DATABASE);
        database.exec("BEGIN IMMEDIATE");
        process.stdout.write("locked\\n");
        setTimeout(() => {
          database.exec("COMMIT");
          database.close();
        }, 250);
      `,
    ],
    {
      env: { ...process.env, OUI_LOCK_DATABASE: databasePath },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );

  try {
    const [ready] = await once(blocker.stdout, "data");
    expect(String(ready)).toContain("locked");

    setPermission(databasePath, "items.update", false);
    await waitForExit(blocker);

    const verification = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const row = verification
        .prepare(
          "SELECT COUNT(*) AS count FROM permissions WHERE actor_id = ? AND permission = ?",
        )
        .get("uat-actor", "items.update") as { readonly count: number };
      expect(row.count).toBe(0);
    } finally {
      verification.close();
    }
  } finally {
    await waitForExit(blocker);
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

async function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode === null) await once(child, "exit");
  expect(child.exitCode).toBe(0);
}

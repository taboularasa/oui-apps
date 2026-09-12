import { DatabaseSync } from "node:sqlite";

export function setPermission(
  databasePath: string,
  permission: string,
  enabled: boolean,
): void {
  const database = new DatabaseSync(databasePath, { timeout: 5_000 });
  try {
    if (enabled) {
      database
        .prepare(
          "INSERT OR IGNORE INTO permissions(actor_id, permission) VALUES(?, ?)",
        )
        .run("uat-actor", permission);
    } else {
      database
        .prepare(
          "DELETE FROM permissions WHERE actor_id = ? AND permission = ?",
        )
        .run("uat-actor", permission);
    }
  } finally {
    database.close();
  }
}

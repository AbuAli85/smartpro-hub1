import type { User } from "../../drizzle/schema";

/** Cookie session user + global platform role slugs from `platform_user_roles`. */
export type SessionUser = User & { platformRoles: string[] };

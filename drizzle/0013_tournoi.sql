CREATE SCHEMA "tournament";
--> statement-breakpoint
CREATE TABLE "tournament"."champions" (
	"player_id" text PRIMARY KEY NOT NULL,
	"sawmill" integer DEFAULT 0 NOT NULL,
	"quarry" integer DEFAULT 0 NOT NULL,
	"mine" integer DEFAULT 0 NOT NULL,
	"forged" integer DEFAULT 0 NOT NULL,
	"power" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament"."tournaments" (
	"tournament_id" text PRIMARY KEY NOT NULL,
	"host_id" text NOT NULL,
	"host_name" text NOT NULL,
	"entrants" integer NOT NULL,
	"status" text NOT NULL,
	"opened_at" bigint NOT NULL,
	"started_at" bigint
);
--> statement-breakpoint
CREATE INDEX "tournaments_opened_at_idx" ON "tournament"."tournaments" USING btree ("opened_at");
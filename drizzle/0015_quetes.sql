CREATE SCHEMA "quests";
--> statement-breakpoint
CREATE TABLE "quests"."activity" (
	"player_id" text NOT NULL,
	"day" integer NOT NULL,
	"activity" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "activity_player_id_day_activity_pk" PRIMARY KEY("player_id","day","activity")
);
--> statement-breakpoint
CREATE TABLE "quests"."villagers" (
	"player_id" text PRIMARY KEY NOT NULL
);

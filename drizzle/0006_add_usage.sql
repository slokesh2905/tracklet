CREATE TABLE "add_usage" (
	"user_id" text NOT NULL,
	"day" date DEFAULT current_date NOT NULL,
	"reads" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "add_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "add_usage" ADD CONSTRAINT "add_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
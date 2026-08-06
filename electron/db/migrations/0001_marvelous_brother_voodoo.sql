CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`overview` text,
	`still_path` text,
	`tmdb_id` integer,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_season_number_uq` ON `episodes` (`season_id`,`number`);--> statement-breakpoint
CREATE TABLE `genres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_name_unique` ON `genres` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `genres_tmdb_uq` ON `genres` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title_vo` text NOT NULL,
	`title_vf` text,
	`year` integer,
	`overview` text,
	`tmdb_id` integer,
	`poster_path` text,
	`backdrop_path` text,
	`trailer_youtube_key` text,
	`personal_rating` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_type_idx` ON `media` (`type`);--> statement-breakpoint
CREATE INDEX `media_tmdb_idx` ON `media` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `media_genres` (
	`media_id` integer NOT NULL,
	`genre_id` integer NOT NULL,
	PRIMARY KEY(`media_id`, `genre_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_people` (
	`media_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`role` text NOT NULL,
	`character` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`media_id`, `person_id`, `role`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `media_tags` (
	`media_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`media_id`, `tag_id`),
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tmdb_id` integer,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_tmdb_uq` ON `people` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `people_name_idx` ON `people` (`name`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`overview` text,
	`poster_path` text,
	FOREIGN KEY (`series_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_series_number_uq` ON `seasons` (`series_id`,`number`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `video_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer,
	`episode_id` integer,
	`rel_path` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`duration_sec` integer,
	`video_codec` text,
	`audio_codec` text,
	`width` integer,
	`height` integer,
	`part_number` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`scanned_at` integer NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "video_files_owner_check" CHECK(("video_files"."media_id" IS NULL) <> ("video_files"."episode_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_files_rel_path_unique` ON `video_files` (`rel_path`);--> statement-breakpoint
CREATE INDEX `video_files_media_idx` ON `video_files` (`media_id`);--> statement-breakpoint
CREATE INDEX `video_files_episode_idx` ON `video_files` (`episode_id`);--> statement-breakpoint
CREATE INDEX `video_files_status_idx` ON `video_files` (`status`);--> statement-breakpoint
CREATE TABLE `watch_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_id` integer,
	`episode_id` integer,
	`watch_count` integer DEFAULT 0 NOT NULL,
	`last_watched_at` integer,
	`resume_position_sec` integer,
	`completed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "watch_state_owner_check" CHECK(("watch_state"."media_id" IS NULL) <> ("watch_state"."episode_id" IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watch_state_media_uq` ON `watch_state` (`media_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `watch_state_episode_uq` ON `watch_state` (`episode_id`);
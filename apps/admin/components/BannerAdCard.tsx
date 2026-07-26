"use client";

import { useActionState } from "react";

import { saveBanner, type ActionResult } from "@/app/actions";
import type { HomepageConfig } from "@/lib/homeContent";

import {
  ActionStatus,
  cardClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  textareaClass
} from "./forms";

const INITIAL: ActionResult = { ok: true, error: null, saved: false };

const fileInputClass =
  "text-sm text-khakis file:mr-3 file:rounded-pill file:border-2 file:border-oreo file:bg-beige file:px-4 file:py-2 file:text-xs file:font-medium file:text-oreo";

type BannerAdCardProps = {
  readonly config: HomepageConfig;
};

export function BannerAdCard({ config }: BannerAdCardProps) {
  const [state, formAction, pending] = useActionState(saveBanner, INITIAL);

  return (
    <section className={cardClass}>
      <h2 className="text-xl font-bold text-white">Banner ad</h2>
      <p className="mt-1 text-sm text-khakis">
        Image mode wins when an image is set; text mode needs a title. The slot hides when
        disabled or empty.
      </p>
      <form action={formAction} className="mt-4 flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-white">
          <input
            className="h-4 w-4 accent-gulch-green"
            defaultChecked={config.bannerEnabled}
            name="enabled"
            type="checkbox"
          />
          Show the banner ad on Home
        </label>

        {config.bannerImageUrl ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-khakis">Current image</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL, no next/image loader configured */}
            <img
              alt="Current banner ad"
              className="w-full max-w-md rounded-xl border-2 border-oreo bg-oreo object-contain"
              src={config.bannerImageUrl}
              style={{ aspectRatio: 2 }}
            />
            <label className="flex items-center gap-2 text-sm text-khakis">
              <input className="h-4 w-4 accent-gulch-green" name="removeImage" type="checkbox" />
              Remove current image
            </label>
          </div>
        ) : null}

        <label className={labelClass}>
          {config.bannerImageUrl ? "Replace image" : "Image"} (PNG, JPEG, WebP, or GIF — max 5 MB)
          <input
            accept="image/png,image/jpeg,image/webp,image/gif"
            className={fileInputClass}
            name="image"
            type="file"
          />
        </label>

        <label className={labelClass}>
          Title (text mode)
          <input
            className={inputClass}
            defaultValue={config.bannerTitle ?? ""}
            maxLength={80}
            name="title"
          />
        </label>
        <label className={labelClass}>
          Body (text mode)
          <textarea
            className={textareaClass}
            defaultValue={config.bannerBody ?? ""}
            maxLength={200}
            name="body"
            rows={2}
          />
        </label>
        <label className={labelClass}>
          Link URL (optional)
          <input
            className={inputClass}
            defaultValue={config.bannerLinkUrl ?? ""}
            name="linkUrl"
            type="url"
          />
        </label>

        <div className="flex items-center gap-3">
          <button className={primaryButtonClass} disabled={pending} type="submit">
            Save
          </button>
          <ActionStatus pending={pending} state={state} />
        </div>
      </form>
    </section>
  );
}

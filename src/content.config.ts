import { defineCollection, z } from "astro:content";
import { file, glob } from "astro/loaders";
import { projectLinkKinds } from "./content/project-links";

const localAsset = z
  .string()
  .regex(/^\/(?!\/)/, "Use a local public asset path beginning with /");

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    order: z.number().default(0),
    draft: z.boolean().default(false),
    badge: z.string().optional(),
    media: z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("image"),
          src: localAsset,
          alt: z.string().default(""),
        }),
        z.object({
          type: z.literal("video"),
          src: localAsset,
          poster: localAsset.optional(),
          alt: z.string().min(1),
        }),
      ])
      .optional(),
    links: z
      .array(
        z.object({
          label: z.string(),
          href: z.string().url(),
          kind: z.enum(projectLinkKinds).optional(),
        }),
      )
      .default([]),
  }),
});
const gallery = defineCollection({
  loader: file("./src/content/gallery.json"),
  schema: z.object({
    title: z.string(),
    src: localAsset,
    alt: z.string().min(1),
    width: z.number().positive().int(),
    height: z.number().positive().int(),
    caption: z.string().optional(),
    order: z.number().default(0),
  }),
});
export const collections = { projects, gallery };

import type { MetadataRoute } from "next";
import { defaultBooks } from "@/lib/default-books";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://kaushalboii.github.io/MyDiary";
  const now = new Date();

  const bookUrls: MetadataRoute.Sitemap = defaultBooks.map((book) => ({
    url: `${baseUrl}/book/?id=${encodeURIComponent(book.id)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    ...bookUrls,
  ];
}


import util from "node:util";
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import cheerio from "cheerio";
import slugify from "slugify";

import { findAssetsInRichText } from "../../import/assets.mjs";


// Wraps `execFile` in a Promise-based interface
const processExec = util.promisify(childProcess.execFile);

// Converts document's HTML to a rich text field datastructure
export const toPrismicRichText = async text => {
  const { stdout, stderr } = await processExec("html2prismic", ["--format", "v2", text]);

  const result = JSON.parse(stdout);

  return result;
};

// Enriches the document with fields extracted from it's HTML export
export const fromHtml = async document => {
  // Read the page and parse it
  const pageContents = await fs.readFile(document.path, { encoding: "utf8" });
  const $ = cheerio.load(pageContents);

  // A small helper to turn relative paths in the document to URLs
  const asUrl = path => path && new URL(path, document.path);

  // Extract page title
  const title = $("title").text();

  // Find the HTML elements that have the information we need
  const $body                = $("body");
  const $main                = $body.find("main");
  const $chapterIllustration = $main.find("header img");
  const $chapterTitle        = $main.find("section h2");
  const $contents            = $chapterTitle.nextAll();
  
  // Use language from the body tag as document's language
  const language = $body.attr("lang");

  // Use page filename title as document slug, we will use that to associate
  // alternate language versions by
  const filename = path.basename(document.path.pathname, ".html");
  const uid      = slugify(`story-${ filename }`, { strict: true, lower: true });

  // Extract document fields
  const chapterTitle        = [ { type: "heading1", text: $chapterTitle.text() } ];
  const chapterIllustration = asUrl($chapterIllustration.attr("src"));
  const previousChapter     = asUrl($main.find("nav a[rel=prev]").attr("href"));
  const nextChapter         = asUrl($main.find("nav a[rel=next]").attr("href"));
  const contents            = await toPrismicRichText(cheerio.html($contents));
  
  // Add the information to the document
  return {
    ...document,
    type: "story", // Custom type we will import the pages as
    title,
    uid,
    lang: language,
    data: {
      chapterTitle,
      chapterIllustration,
      previousChapter,
      nextChapter,
      contents
    }
  }
};

// Returns a list of assets used in the given `story` document
export const findAssets = ({ type, data, path }) => {
  // We only handle this specific kind of document here
  if (type != "story") return [];
  
  return [
    data.chapterIllustration,
    ...findAssetsInRichText(data.contents).map(src => new URL(src, path))
  ];
};

// Resolves asset and documents references in the given `story` document
export const resolveReferences = ({ document, resolvers }) => {
  // We only handle this specific kind of document here
  if (document.type != "story") return document;

  return Promise.resolve(document.data)
    .then(resolvers.linkField("chapterIllustration"))
    .then(resolvers.linkField("previousChapter"))
    .then(resolvers.linkField("nextChapter"))
    .then(resolvers.richTextField("contents"))
    .then(data => ({ ...document, data }));
}

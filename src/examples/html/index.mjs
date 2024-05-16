#!/usr/bin/env node

import { 
  findDocuments, mapDocuments, syncWithMigrationRelease,
  findAssets, syncWithMediaLibrary, resolveReferences,
  assignAlternateLanguages, dumpState, readState
} from "../../import/index.mjs";

import * as story from "./story.mjs";


const documents = await findDocuments("examples/html/**/*.html")
  .then(mapDocuments(story.fromHtml))
  .then(syncWithMigrationRelease({ includeFields: false, onlyLanguages: [ "en-us" ] }))
  .then(assignAlternateLanguages({ mainLanguage: "en-us" }))
  .then(syncWithMigrationRelease({ includeFields: false }))
  .then(findAssets(story.findAssets))
  .then(syncWithMediaLibrary)
  .then(resolveReferences(story.resolveReferences))
  .then(syncWithMigrationRelease());

// If you want to save intermediate processing steps (e.g. to resume after a failure)
// const documents = await findDocuments("examples/html/**/*.html")
//   .then(mapDocuments(story.fromHtml))
//   .then(dumpState("documents.json"))
//   .then(syncWithMigrationRelease({ includeFields: false, onlyLanguages: [ "en-us" ] }))
//   .then(dumpState("with-en-document-ids.json"))
//   .then(assignAlternateLanguages({ mainLanguage: "en-us" }))
//   .then(dumpState("with-alternate-languages.json"))
//   .then(syncWithMigrationRelease({ includeFields: false }))
//   .then(dumpState("with-all-document-ids.json"))
//   .then(findAssets(story.findAssets))
//   .then(dumpState("with-assets.json"))
//   .then(syncWithMediaLibrary)
//   .then(dumpState("with-uploaded-assets.json"))
//   .then(resolveReferences(story.resolveReferences))
//   .then(dumpState("with-references-resolved.json"))
//   .then(syncWithMigrationRelease())
//   .then(dumpState("with-final-documents.json"))


// If you want to try resuming from a latter step, you could try doing this:
// const documents = await readState("with-uploaded-assets.json")
//   .then(resolveReferences(resolveReferencesForStory))
//   .then(dumpState("with-references-resolved.json"))
//   .then(syncWithMigrationRelease())
//   .then(dumpState("with-final-document.json"))


console.log(documents);

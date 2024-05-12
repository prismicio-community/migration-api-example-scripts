#!/usr/bin/env node

import { 
  mapDocuments, syncWithMigrationRelease,
} from "../../import/index.mjs";

import * as documents from "./documents.mjs";


// Updates a single document by appending a paragraph with update date
const updateDocument = async document => ({
  ...document,
  data: {
    ...document.contents,
    contents: [
      ...document.data.contents,
      {
        type: "paragraph",
        text: `Updated at ${ new Date() }`,
      },
    ],
  },
});

const documentMapper = mapDocuments(updateDocument);

const processDocuments = async documents =>
  documentMapper(documents)
    .then(syncWithMigrationRelease());

// You can either:

// Process all documents at once
const updatedDocuments = await documents.loadAll()
  .then(processDocuments);

console.log(updatedDocuments);

// Or process document in batches, using an asynchronous generator
// for await (const batch of documents.getInBatches({ pageSize: 2 })) {
//   console.log("Processing page:", batch.page);
//
//   await processDocuments(batch);
// }

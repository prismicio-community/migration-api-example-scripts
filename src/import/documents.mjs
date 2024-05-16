import { pathToFileURL } from "node:url";

import { glob } from "glob";
import { pick } from "lodash-es";

import { migrationApiClient } from "./utils.mjs";


// Find all the documents matching the glob in a directory
export const findDocuments = async documentGlob => {
  const paths     = await glob(documentGlob, { absolute: true });
  const documents = paths.map(path => ({ path: pathToFileURL(path) }));

  return { documents };
};

// Generate a function that will apply the given `mapping` to all the documents in the current
// processing state. The processed documents will be also indexed into a `documentMap` to easily
// resolve them by file path
export const mapDocuments = mapping =>
  async processingState => {
    // Apply the mapping to all documents – since a mapping can be potentially asynchronous,
    // we collect the results using `Promise.all`
    const documents = await Promise.all(
      processingState.documents.map(async document => ({  ...document, ...await mapping(document) }))
    );
    // Collect mapped documents into a `documentMap` keyed by their paths
    const documentMap = new Map(
      documents.map(document => document.path && [ document.path.toString(), document ])
        .filter(Boolean)
    );

    return {
      ...processingState,
      documents,
      documentMap,
    }
  };

// Ensures this document is present in the migration release and it's contents are up to date
//
// Skips sending document fields if `includeFields` is `false` – might be useful if you want
// to create documents, but fields are not yet Migration API compliant (for example, you
// haven't yet resolved links to other documents to their Prismic IDs)
const syncDocumentWith = ({ includeFields = true } = {}) => async document => {
  const requestParams = document.id
    ? { method: "PUT", url: `/documents/${ document.id }` }
    : { method: "POST", url: "/documents" }

  // Send only the fields that we know the API expects
  const data = pick(document, [
    "title", "type", "lang", "uid", "alternate_language_id"
  ]);

  // Include fields only if asked to
  data.data = includeFields
    ? document.data
    : {};
                 
  // Upsert the document
  const response = await migrationApiClient({
    ...requestParams, data
  })

  // Add the uploaded document's ID to the document metadata
  return {
    ...document,
    id: response.data.id,
  };
}

// Ensures that all documents in the migration release are up-to-date with the current
// processing state,
//
// Accepts two possible options:
//   * `onlyLanguages` – when set, limits the documents sent to matching languages only,
//   * `includeFields` – when set to `false`, documents are sent without their field content.
export const syncWithMigrationRelease = (options = {}) => {
  const syncDocument      = syncDocumentWith(options);
  const { onlyLanguages } = options;

  return processingState => {
    // Create a set of languages we want to sync
    const allowedLanguages = new Set(
      onlyLanguages ?? processingState.documents.map(({ lang }) => lang)
    );
    // And sync only documents in those languages
    const syncMatchingDocuments = mapDocuments(document =>
      allowedLanguages.has(document.lang)
        ? syncDocument(document)
        : document
    );

    return syncMatchingDocuments(processingState);
  };
};

// Ensures that documents in alternate languages will be referencing the document in
// your `mainLanguage` that shares the same `commonKey` (by default, `uid`) 
export const assignAlternateLanguages = ({ 
  mainLanguage,
  commonKey = ({ uid }) => uid
} = {}) =>
  async processingState => {
    // Collect the mapping from the `commonKey`s of main language documents
    // to their IDs
    const mainDocuments = new Map(
      processingState.documents
        .filter(({ lang }) => lang == mainLanguage)
        .map(document => [ commonKey(document), document.id ])
    );
    // Add alternate language id to documents in other languages
    const withAlternateLanguageIds = mapDocuments(document =>
      document.lang != mainLanguage
        ? {
            ...document,
            alternate_language_id: mainDocuments.get(commonKey(document))
          }
        : document
    );
    
    return withAlternateLanguageIds(processingState);
  };

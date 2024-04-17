import process from "node:process";
import fs      from "node:fs/promises";
import path    from "node:path";

import axios     from "axios";
import rateLimit from "axios-rate-limit";
import dotenv    from "dotenv";


// Load envvars from an optional .env file
dotenv.config();

// Asset API credentials
const repository             = process.env.PRISMIC_REPOSITORY;
const prismicWriteApiToken   = process.env.PRISMIC_WRITE_API_TOKEN;
const prismicMigrationApiKey = process.env.PRISMIC_MIGRATION_API_KEY;
const migrationApiUrl        = process.env.PRISMIC_MIGRATION_API_BASE_URL || "https://migration.prismic.io";
const assetApiUrl            = process.env.PRISMIC_ASSET_API_BASE_URL || "https://asset-api.prismic.io";

// Common headers for Write APIs
const writeApiHeaders = {
  "Accept":        "application/json",
  "Content-Type":  "application/json",
  "Repository":    repository,
  "Authorization": `Bearer ${ prismicWriteApiToken }`,
  "X-Api-Key":     prismicMigrationApiKey
};

// Client for the Migration API
export const migrationApiClient = rateLimit(
  axios.create({
    baseURL: migrationApiUrl,
    headers: writeApiHeaders,
  }),
  // Make only 1 request per 2.5s to avoid rate-limits
  { maxRequests: 1, perMilliseconds: 2500 }
);

// Client for the Asset API
export const assetApiClient = rateLimit(
  axios.create({
    baseURL: assetApiUrl,
    headers: writeApiHeaders,
  }),
  // Make only 1 request per 2.5s to avoid rate-limits
  { maxRequests: 1, perMilliseconds: 2500 }
);

// State persistence helpers

// Helper to save processing step state to JSON
export const dumpState = filename => async processingState => {
  const { documents, assetMap, documentMap } = processingState;
  
  const savePath    = path.join("state", filename);
  const stateToSave = {};

  if (documents) {
    stateToSave.documents = documents;
  }

  if (documentMap) {
    stateToSave.documentMap = Array.from(documentMap.entries())
                                 .map(([key, value]) => [key, documents.findIndex(({ id }) => id == value.id)])
  } 

  if (assetMap) {
    stateToSave.assetMap = Array.from(assetMap.entries());
  }                       

  await fs.writeFile(
    savePath,
    JSON.stringify(stateToSave, undefined, 2),
    { encoding: "utf-8" }
  )

  return processingState;
}

// Helper to save processing step state from JSON
export const readState = async filename => {
  const loadPath  = path.join("state", filename);
  const state     = await fs.readFile(loadPath, { encoding: "utf-8" })
                            .then(JSON.parse);

  const documents = state.documents ?? [];

  if (state.documentMap) {
    state.documentMap = new Map(
      state.documentMap.map(([id, index]) => [id, documents[index]])
   )
  }

  if (state.assetMap) {
    state.assetMap = new Map(state.assetMap)
  }

  return state;
};

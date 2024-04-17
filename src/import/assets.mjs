import fs from "node:fs/promises";
import path from "node:path";

import FormData from "form-data";
import axios from "axios";

import { assetApiClient } from "./utils.mjs";
import { mapRichText } from "./content.mjs";


// Collect all assets in documents, as returned by `assetMapping` and add them to
// the processing state as `assetMap`
export const findAssets = assetMapping => async processingState => {
  // Map documents to assets contained therein
  const foundAssets = await Promise.all(
    processingState.documents.map(assetMapping)
  );

  // Collect them into a map
  const assetMap = new Map(
    foundAssets.flatMap(assets =>  assets.map(url => [ url.toString(), { url } ] ))
  );
  
  // And add them to processing state
  return { ...processingState, assetMap };
};

// Collect all assets in a rich text field
export const findAssetsInRichText = mapRichText({
  element: element => [ 
    element.type == "image"
     ? element.url
     : undefined,
  ],
});

// Returns an existing asset as a readable auto-closeable stream to use for upload
const readAssetAsStream = async asset => {
  // Return a stream for the asset if it's a local file
  if (asset.url.protocol == "file:") {
    return fs.open(asset.url).then(file => file.createReadStream())
  }

  // Try to fetch it from the internet otherwise
  const response = await axios({ 
    method:       "GET",
    url:          asset.url,
    responseType: "stream"
  })

  return response.data;
}

// Return multi-part form data used to upload an asset to Asset API
const assetToFormData = async asset => {
  const existingAsset = await readAssetAsStream(asset);
  const filename      = path.basename(asset.url.pathname);
  const formData      = new FormData();

  // Asset API requires files to have a filename specified
  formData.append("file", existingAsset, { filename });

  if (asset.altText) formData.append("alt", asset.altText)

  return formData;
}

// Ensures that this asset is already present in the Asset API and has an ID
export const syncAsset = async asset => {
  // If the asset already has an id, there's nothing to do
  if (asset.id) return asset;

  const data     = await assetToFormData(asset);
  const response = await assetApiClient.postForm("/assets", data)

  // Add the Prismic Asset API ID to asset's metadata
  return { ...asset, id: response.data.id  };
}

// Add asset metadata to documents and ensure they are present in the Media Library
// and creates a mapping from asset paths to uploaded assets under an `assetMap`
// property of the processing state
export const syncWithMediaLibrary = async processingState => {
  const uploadedAssets = [];
  
  // Unfortunately, iterators don't support a `map` method in Node 20 LTS yet,
  // so we have to resort to an `for ... of` loop and mutating an array
  for (const [key, asset] of processingState.assetMap ?? new Map()) {
    uploadedAssets.push(
      syncAsset(asset).then(uploaded => [key, uploaded])
    );
  }

  // Collect a mapping from asset path, to an uploaded asset
  const assetMap = new Map(await Promise.all(uploadedAssets));

  return { ...processingState, assetMap };
};


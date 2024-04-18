# Importing pages into Prismic

## Prerequisites

### Node.js

This tutorial is written in JavaScript using Node.js 20 LTS runtime and will use modern
JS features – if your runtime doesn't support them, adjust the code accordingly or update
it to a version supporting those features.

You can check if you have the required version installed by running `node --version` in
your shell. If you don't, you can use a tool like [`asdf`](https://asdf-vm.com) or [`nvm`](https://github.com/nvm-sh/nvm#readme) to install it.

You can use either `yarn install` or `npm install` to install dependencies, lock files are
provided for both package managers.

### Prismic rich text converter

We will also use [`kramdown-prismic`](https://github.com/stormz/kramdown-prismic) Ruby gem
(conventional name for Ruby packages) to convert HTML into Prismic rich text format. To run
it, you will need Ruby 2.6 or later – you can check if you have the required version
installed by running `ruby --version` in your shell. If you don't, you can use a tool like
[`asdf`](https://asdf-vm.com) or [`rbenv`](https://github.com/rbenv/rbenv#readme) to install it.

Currently, support for the API V2 format used by the Migration API is available only as a
[pull request](https://github.com/stormz/kramdown-prismic/pull/17). If you're not familiar
with the Ruby ecosystem, it might not be immediately obvious how to install it – one option
you can try is the `specific_install` RubyGems plugin (you will also need to have `git`
available):

```bash
# In case of permission issues with a global Ruby install, you will have to add
# `sudo` before each use of the `gem` command
gem install specific_install

# Installs the gem version from the branch
gem specific_install -l "http://github.com/prismicio/kramdown-prismic.git" -b "prismic-v2-format"

# Removes the gem, if you don't need it anymore
gem uninstall kramdown-prismic
```

There are other options, such as using [`bundler`](https://bundler.io) with a `Gemfile` and calling the command
with `bundle exec` or checking out the source, building the gem with `gem build` and installing
the build result. Pick one that works best for you.

### Prismic repository setup

Our example will be using a repetable custom type named `story` with the following fields:

| Field name          | Field type           |
| --------------------|----------------------|
| uid                 | uid                  |
| chapterIllustration | image                |
| chapterTitle        | title                |
| previousChapter     | content relationship |
| nextChapter         | content relationship |
| contents            | rich text            |


Please create it if you want to follow along using our example data. For you convenience
you can use the JSON file provided at `examples/html/customtypes/story/index.json` with
your Slice Machine setup.

You also need to have `en-gb` and `fr-fr` locales enabled, because the example script
imports documents into those two locales. If you use legacy custom type editor, you can
copy the value of json property in the Slice Machine file into the editor, it should
be compatible with it.

### Credentials

To be able to interact with the Asset and Migration APIs you will need to prepare:

  * a Write API Token,
  * a Migration API Demo Key
  * the name of the repository you will be using.

You can use the `.env.example` file as a template to create an `.env` file in the root
of the repository and put your credentials here – the example code uses [`dotenv`](https://github.com/motdotla/dotenv#dotenv-) as not
to force you to specify those environment variables on each command.

## Exporting your data

Exporting data from an existing website depends a lot on the tools you used to create it
and as such explaining how to prepare data in your specific case is out of scope of this
tutorial.

In the interest of providing a working example we will use a simple HTML website from the
`examples/html` directory, which might be useful if your website can be exported in such
a format.

## Parsing your data

Once you have exported your website, you have to parse it into data structures you can then
use to re-create the webpage as Prismic documents.

This process is also very specific to how the website is built. In the case of the example
pages provided, an appropriate solution is to use a HTML parser and extract data from the
document structure – a popular option is the [`cheerio` library](https://cheerio.js.org), wih a familiar jQuery-like
interface. For other export formats, you will have to choose other libraries that are
appropriate for that format.

### High-level overview

The HTML import script is located at `src/examples/html/index.mjs` and you can run it with
`yarn examples:html` or `npm run examples:html` if you want to test how it works.

Here is how the script code itself looks:

```javascript
// Generic import processing functions provided for use in examples.
import { 
  findDocuments, mapDocuments, syncWithMigrationRelease,
  findAssets, syncWithMediaLibrary, resolveReferences,
} from "../../import/index.mjs";

// Example-specific code for processing the provided HTML pages into
// Prismic documents of the previously mentioned `story` custom type.
import story from "./story.mjs";

const documents = await findDocuments("examples/html/**/*.html")
  .then(mapDocuments(story.fromHtml))
  .then(syncWithMigrationRelease({ includeFields: false, onlyLanguages: [ "en-gb" ] }))
  .then(assignAlternateLanguages({ mainLanguage: "en-gb" }))
  .then(syncWithMigrationRelease({ includeFields: false }))
  .then(findAssets(story.findAssets))
  .then(syncWithMediaLibrary)
  .then(resolveReferences(story.resolveReferences))
  .then(syncWithMigrationRelease());
```

This is not pseudocode, but actual code taken from the `index.mjs` file – the script is
structured as a series of processing step building off each other, transforming the data
from the input format to fully imported documents, step by step.

While what each step does should be fairly self-explanatory from the function names, you
might wonder why we are doing `syncWithMigrationRelease` multiple times. This is necessary
because some operations require IDs of existing documents:

  * setting an alternate language is possible only when creating documents – to solve that
    issue, we first have to import the documents for the main language (using the
    `onlyLanguages: [ "en-gb" ]` parameter), and only then use their IDs as alternative
    language IDs when importing the documents in other languages,

  * resolving references to other documents in document fields also requires knowing their
    IDs and you can't upload a document with incorrect field values – to solve that issue,
    we first import the documents without their contents (using the `includeFields`
    parameter), then use resulting IDs to resolve the document references and finally
    update the documents with the finalised contents.

You can also notice that there are `dumpState` and `readState` helpers available – you can
insert them between the processing steps to save and restore the processing state. It can be
useful if you want to see what's happening without resorting to a debugger or even resume
work from a latter step if something failed by `readState`ing the last succesful step.

### Find all your files

The first step is finding all the files we want to import into Prismic. In case of files
already present on the computer – like our example – the simplest solution would be to use
a use a globbing library, which will find all the files matching a specified pattern for
you, without having to manually traverse the filesystem using `node:fs`. A popular option
for that is the appropriatly named [`glob` library](https://www.npmjs.com/package/glob).

Here's an excerpt from `src/import/documents.mjs`, showing how we discover files:

```javascript
import { pathToFileURL } from "node:url";

import { glob } from "glob";


export const findDocuments = async documentGlob => {
  const paths     = await glob(documentGlob);
  const documents = paths.map(path => ({ path: pathToFileURL(path) }));

  return { documents };
};
```

When you run it against the example directory, the function will discover all HTML files
matching the glob pattern – the library's readme contains a [list of supported glob patterns](
https://github.com/isaacs/node-glob?tab=readme-ov-file#glob-primer), should you need
a refresher – and return them as an object representing the processing state.

A good way to experiment with how it works is to start a REPL using the `node` command. We
will represent a REPL session by using `>` to show the code you should enter and directly
below show the result of this expression:

```javascript
// In the REPL sessions we will use on variable keyword (or `var`, if syntactically necessary,
// as below) so we can easily modify the variables and functions as we go along.
> var { findDocuments } = await import("./src/import/documents.mjs");
undefined

// Note that we will sometimes expand or omit certain parts the result for clarity,  compared
// to the default REPL output. Omitted parts will be represented by `...`.
> processingState = findDocuments("examples/html/**/*.html");
Promise { ... }

> await processingState
{
  documents: [
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } },
    { path: Url { ... } }
  ]
}
```

Two choices might bear explanation – the first is the usage of the `URL` class to represent
file paths. It's an arguably more convenient way to resolve paths and tell whether links
are to local pages in the export:

```javascript
// The URL path is always absolute, thus unambigous in what it refers to
> processingState.documents[0].path.href
"file:///home/user/project/examples/html/fr/good-end.html"

// It's very easy to tell if it's a local file or a web link by looking at the protocol
> processingState.documents[0].path.protocol
"file:"

// If we use pass current file's URL as the `base` URL (the second argument)
// Relative links will keep the `file:` protocol of the file path
> new URL("relative/file.ext", "file:///some/path/that/is/absolute").href
"file:///some/path/that/is/relative/file.ext"

// External links will completely replace the base URL and use link's protocol
// We can use that to differentiate them from local assets or documents
> new URL("https:///some.web/page", "file:///some/path/that/is/absolute").href
"https:///some.web/page"
```

The other choice is that – instead of returing the document array directly – we decided
to nest the result under a `documents` property of an object. We will use this object to
represent the current processing state, so we can enrich it with additional information
(for example, a mapping from file path to Prismic document ID) as we continue to process
the documents further.

### Extract information from the HTML

It is usually helpful to approach a problem by decomposing it into smaller pieces. As such,
we will first write a function that can process a single document, and then apply it to all
documents.

Here's an excerpt from `src/examples/html/story.mjs` to show how such a function could
be structured at a high level:

```javascript
import fs from "node:fs/promises";

import cheerio from "cheerio";


export const fromHtml = async document => {
  // Read the HTML page and parse it
  const pageContents = await fs.readFile(document.path, { encoding: "utf8" });
  const $ = cheerio.load(pageContents);

  // Extract the relevant data from the parsed page
  const title = $("title").text();

  // ...

  // Use page filename title as document slug, we will use that value
  // to associate alternate language versions by
  const filename = path.basename(document.path.pathname, ".html");
  const uid      = slugify(`story-${ filename }`, { strict: true, lower: true });

  // ...
  
  // And add this information to the document
  // For simplicity we mirror the format of the `POST /documents` Migration API endpoint:
  // https://prismic.io/docs/migration-api-technical-reference#post:
  return {
    ...document,
    title,
    uid,
  }
}
```

Feel free to refer to the aforementioned file should you want to see the full
implementation. It basically does more of the same and should be fairly well-commented.

Now, we need to apply this mapping function to all the documents. To accomplish that we
will introduce a `mapDocuments` helper:

```javascript
// Close over a (potentially async, like `fromHtml` above) function mapping
// a single document
> mapDocuments = mapping =>
    // And provide a function applying the it to all the documents
    // in the processing state
    async processingState => {
      // Since a mapping can be potentially asynchronous, we collect
      // the results using `Promise.all`
      const documents = await Promise.all(
        processingState.documents.map(
          async document => ({  ...document, ...await mapping(document) })
        )
      );
      // Collect mapped documents into a `documentMap` keyed by their paths
      const documentMap = new Map(
        documents.map(document => [ document.path.toString(), document ])
      );

      return {
        ...processingState,
        documents,
        documentMap,
      }
    };
[Function: mapDocuments]
```

With those two functions in place, we can now test how the mapping code works:

```javascript
// We will import the existing implementations for convenience
> var { fromHtml: storyFromHtml } = await import("./src/examples/html/story.mjs");
undefined

// Update the processing state with document fields
> processingState = processingState.then(mapDocuments(storyFromHtml))
Promise { ... }

// And see that it worked
> await processingState
{
  documents: [
    {
      path: URL { ... },
      type: "story",
      title: "La Geste de Foo Bar – Good End",
      uid: "story-good-end",
      lang: "fr-fr",
      data: {
        chapterTitle: "Good End!",
        chapterIllustration: URL { ... },
        previousChapter: undefined,
        nextChapter: URL { ... },
        contents: [ 
          {
            type: "paragraph",
            text: "Hark, for you have reached the good end!",
            spans: [
              { type: "em", start: 31, end: 39 }
            ]
          },
          ...
         ]
      }
    },
    ...
  ],
  documentMap: Map(10) {
    "file:///home/user/project/.../examples/html/fr/good-end.html" => {
      ... // the same document as above
    },
    ...
  }
}
```

As you can see, our barebones `{ path }` document representation was enriched with
the field information we extracted from the HTML page and the documents were indexed
into a map, so we can easily get a corresponding Prismic document by the path of it's
source HTML file.

### Aside: Prismic rich text

Prismic expects you to provide a formatted test in the Prismic rich text format. When
migrating documents, it can be often useful to traverse the rich text content – for
example to find all referenced assets or remove unwanted elements.

To facilitate that, we provide a `mapRichText` helper, that you can use to transform
the rich text – you can read the full implementation in `src/import/content.mjs`,
but at a high level it will iterate over all the elements, apply a `span` mapping
function on them, and then apply the `element` mapping function on the resulting
element with updated spans.

Depending on what you return from the mapping functions you can accomplish different
results. You can of course return a single element or span and it will be replaced
in it's containing array. But you can also do other things.

For example, if you return `undefined` or `null`, the currently processed element or
span will be removed from it's containing array:

```javascript
> var { mapRichText } = await import ("./src/import/content.mjs");
undefined

// Remove unwanted elements or spans
> removeEmSpans = mapRichText(
    { span: span => span.type == "em" ? undefined : span }
  )
[Function (anonymous)]

// Documents have spans
> (await processingState).documents[0].data.contents.map(({ spans }) => spans)
[
  [ { type: "em", start: 31, end: 39 } ],
  [],
  [
    { type: "em", start: 62, end: 73 },
    { type: "em", start: 215, end: 224 }
  ]
]

// And now they don't
> removeEmSpans(
    (await processingState).documents[0].data.contents).map(({ spans }) => spans
  )
[ [], [], [] ]
```

If you return an array of one or more elements or spans, they will be spliced
into the containg array:

```javascript
// Add a paragraph after an image
> complimentImage = mapRichText({ 
    element: (element => element.type == "image"
                ? [ element, { type: "paragraph",
                               text: "That's a cool image!" } ]
                : element)
  })
[Function (anonymous)]

// Now everybody is sure to know it's a cool image
> complimentImage((await processingState).documents[1].data.contents)
[
  ...
  {
    type: "image",
    alt: null,
    url: "../assets/images/magic-battle.png"
  },
  {
    type: "paragraph",
    text: "That's a cool image!"
  },
  ...
]
```

You can even decide to return non-element result if it's useful for you – for example
you can leverage it to traverse the rich text and collect information you want, such as
all URLs referenced in the rich text content:

```javascript
> var { uniq } = await import ("lodash-es");
undefined

> findAllUrls = mapRichText({ 
    // Find links in a span
    span:    span => span.type == "hyperlink"
               ? span.data.url
               : undefined,
    // Find links in an element and concatenate all links
    // previously found in the element's spans
    element: element => [ 
               element.type == "image"
                ? element.url
                : undefined,
               ...element.spans ?? []
             ],
  })
[Function (anonymous)]

// Thos are all the referenced URL in the document
> uniq(findAllUrls((await processingState).documents[1].data.contents))
[
  "bad-end.html",
  "good-end.html",
  "../assets/images/magic-battle.png"
]
```

That last example is something that will come handy in a section or two.

### Create documents

At this point, it might be a good idea to run our documents through the Migration API.
As we mentioned in the overview, we can't include field content when importing documents
initially due to unresolved asset/document references and we can't import all documents
at once, because we require main language document IDs for documents in alternate languages.

To resolve this issue, the function to import the documents will allow you to specify
what types of documents you want to sync with this call.

To import the documents we will make requests to the [Prismic Migration API](
https://prismic.io/docs/migration-api-technical-reference). We will use the popular
[`axios`](https://axios-http.com/) library to talk to it and [`axios-rate-limit`](https://github.com/aishek/axios-rate-limit#readme) to respect the rate limits of the
API. You can consult the `src/import/utlis.mjs` file to see how to configure the axios
client properly, below we will just import it from that file.

As usual, we will first focus on importing a single document:

```javascript
> var { migrationApiClient } = await import("./src/import/utils.mjs");
undefined

> var { mapKeys, pick } = await import("lodash-es");
undefined

// Ensures this document is present in the migration release and it's contents are up to date
> syncDocumentWith = ({ includeFields = true } = {}) => async document => {
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

    // Add the uploaded document's id to the document metadata
    return {
      ...document,
      id: response.data.id,
    };
  };
[Function: syncDocumentWith]
```

And then we apply this to all the documents in the processing state:

```javascript
> syncWithMigrationRelease = (options = {}) => {
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
[Function: syncWithMigrationRelease]

// Let's now import all the English language documents
> processingState = processingState.then(
    syncWithMigrationRelease({ includeFields: false, onlyLanguages: [ "en-gb" ] })
  )
Promise { ... }

// This might take a few seconds first time you do this, due to the rate limits
> await processingState
{ 
  documents: [
    ...
    {
      path: URL { ... },
      type: "story",
      title: "The Story of Foo Bar – Good End",
      uid: "story-good-end",
      lang: "en-gb",
      data: { ... },
      id: "ZhzVZhAAAOMK0PiB"
    },
    ...
  ],
  documentMap: Map(10) {
    ...
    "file:///home/user/project/.../examples/html/en/good-end.html" => {
      ... // the same document as above
    }
  }
}
```

As you can see, the English documents now have Prismic IDs and will be present in the
migration release, if you check it in Prismic UI. We have also stored the mapping between
the document paths and documents in the `documentMap`, which will come in handy when we
will want to turn all references to other imported pages to Prismic document links via
their IDs.

### Handling alternate language versions

As mentioned in the overview, to properly handle alternate language versions, we have
to first separately import documents in your main language (`en-gb` in our example) and
then update documents in alternate languages to reference the main language document
as their `alternate_language_id` before importing them.

To do this, we can use the following function:

```javascript
> assignAlternateLanguages = ({ 
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
    }
```

Using this function we can now update the documents with appropriate `alternate_language_id`s
and sync them with migration release:

```javascript
> processingState = processingState.then(assignAlternateLanguages({ mainLanguage: "en-gb" }))
Promise { ... }

> processingState = processingState.then(syncWithMigrationRelease({ includeFields: false }))
Promise { ... }

> await processingState
> await processingState
{ 
  documents: [
    {
      path: URL { ... },
      type: "story",
      title: "La Geste de Foo Bar – Good End",
      uid: "story-good-end",
      lang: "fr-fr",
      data: { ... },
      id: "ZhzVZhAAAOMK0PeF",
      alternate_language_id: "ZhzVZhAAAOMK0PiB" // same as English document below
    },
    ...
    {
      path: URL { ... },
      type: "story",
      title: "The Story of Foo Bar – Good End",
      uid: "story-good-end",
      lang: "en-gb",
      data: { ... },
      id: "ZhzVZhAAAOMK0PiB"
    },
    ...
  ],
  ...
}
```

### Find assets in the documents

A good next step would be to find and upload all assets referenced in your documents. To do
that, we will have to traverse all the documents and return all used assets. While it might
sound daunting, it is not very complicated in practice. Once again, let's first focus on
a single document case and then see how to apply it to multiple documents.

How the document maps to assets depends entirely on the document structure. In our case, we
have a `chapterIllustration` field that is an image and the `contents` field can also contain
images nested in it's Prismic rich text. To find assets in the `contents` field we can reach
for the `mapRichText` helper described above.

```javascript
> var { mapRichText } = await import ("./src/import/content.mjs");
undefined

// The following will create a mapper that finds all the images in a Prismic rich text
> findAssetsInRichText = mapRichText({
    element: element =>
      element.type == "image"
      ? element.url
      : undefined,
  })
[Function (anonymous)]

> findAssetsInRichText((await processingState).documents[1].data.contents)
[ "../assets/images/magic-battle.png" ]

// Now we map results to URLs for consistency and add the chapter illustration
> findStoryAssets = ({ data, path }) => [
    data.chapterIllustration,
    ...findAssetsInRichText(data.contents).map(src => new URL(src, path)),
  ]
[Function: findStoryAssets]

> findStoryAssets((await processingState).documents[1])
[
  URL { ...}, // for assets/images/dusk.png
  URL { ...}, // for assets/images/magic-battle.png
]
```

Now that we can map a document to assets it contains, the only thing left is to apply this
mapping to all the documents and collect the results in a `Map` for future reference, just
like we had done to the uploaded documents:

```javascript
// Take an `assetMapping` that will return all assets for a given document
> findAssets = assetMapping =>
    // And return a function that will apply it to all assets in the processing state
    async processingState => {
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
    }
[Function: findAssets]

// And now we can find all assets
> processingState = processingState.then(findAssets(findStoryAssets))
Promise { ... }

> await processingState
{
  documents: [
    ...
  ],
  documentMap: Map(10) {
    ...
  },
  assetMap: Map(9) {
    "file:///home/user/.../assets/images/good-end.png" => { url: URL { ... } },
    ...
  }
}
```

### Sync assets with the Media Library

To upload the discovered assets to the Media Library we will use the [Prismic Asset API](
https://prismic.io/docs/asset-api-technical-reference). We will also `axios` to talk to
this API, a pre-configured client is available in `src/import/utils.mjs`.

As usual, we will first focus on uploading a single asset:

```javascript
> var { assetApiClient } = await import("./src/import/utils.mjs")
undefined

// Ensures that this asset is already present in the Asset API and has an ID
> syncAsset = async asset => {
    // If the asset already has an id, there's nothing to do
    if (asset.id) return asset;

    const data     = await assetToFormData(asset);
    const response = await assetApiClient.postForm("/assets", data)

    // Add the Prismic Asset API ID to asset's metadata
    return { ...asset, id: response.data.id  };
  }
[AsyncFunction: syncAsset]
```

As you can see, we will upload the asset only if we didn't already do that – it's a rather
naive check, as we only verify the presence of the `id` property, but it should suffice for
this simple example.

If you need something more robust you can consider calling the API to verify if the ID
exists or alternatively hashing the asset and storing the hash in it's notes, so you will
not re-upload an identical asset, even when retrying your migration.

Uploading the asset is done by calling the `POST /assets` endpoint with the asset attached
as a multipart HTTP form. To accomplish that, we can use the [`form-data` library](https://github.com/form-data/form-data#readme):

```javascript
> var path = await import ("node:path")
undefined 

// The `FormData` constructor is a default import
> var { default: FormData } = await import("form-data")
undefined

// Return multi-part form data used to upload an asset to Asset API
> assetToFormData = async asset => {
    const existingAsset = await readAssetAsStream(asset);
    const filename      = path.basename(asset.url.pathname);
    const formData      = new FormData();

    // Asset API requires files to have a filename specified
    formData.append("file", existingAsset, { filename });

    if (asset.altText) formData.append("alt", asset.altText)

    return formData;
  }
[AsyncFunction: assetToFormData]
```

The `form-data` library can accept files as a form field in different formats. A very
convenient option is an auto-closeable stream, because that way we don't have to care
whether the asset we're uploading comes from a file you saved as a part of the export
or is an external image you want to now import into the Media Library:

```javascript
> var fs = await import("node:fs/promises")
undefined

> var axios = await import("axios")
undefined

// Returns an existing asset as a readable auto-closeable stream to use for upload
> readAssetAsStream = async asset => {
    // Return a stream for the asset if it's a local file
    // Here is where URLs being actual URL objects come in handy
    if (asset.url.protocol == "file:") {
      return fs.open(asset.url).then(file => file.createReadStream());
    }

    // Try to fetch it from the internet otherwise
    const response = await axios({ 
      method: "GET",
      url: asset.url,
      responseType: "stream"
    });

    return response.data;
  }
[AsyncFunction: readAssetAsStream]
```

And with all those pieces in place we can test uploading a single asset:

```javascript
> var { pathToFileURL } = await import("node:url")
undefined

> await syncAsset({ url: pathToFileURL("./examples/html/assets/images/dawn.png") })
{
  url: URL { ... },
  id: "Zhg9brOmp5Xm233k"
}
```

The final step is once again applying this function to all the assets:

```javascript
// Add asset metadata to documents and ensure they are present in the Media Library
> syncWithMediaLibrary = async processingState => {
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
  }
[AsyncFunction: syncWithMediaLibrary]

// Import the assets
> processingState = processingState.then(syncWithMediaLibrary)
Promise { ... }

// This might also take some time, due to the rate limits
> await processingState
{ 
  documents: [],
  documentMap: Map(10) { ... },
  assetMap: Map(9) {
    "file:///home/user/project/.../assets/images/good-end.png" => { 
      url: URL { ...}, 
      id: "ZhzcxLOmp5Xm236V"
    },
    ...
  }
}
```

As you can see, the assets now have `ids` and  we are also indexing our assets into an
`assetMap` for future reference. In the next step we will use that information to properly
link assets and documents together.

### Resolve asset and document references

At this point we now have all the information we need to resolve asset and document
references in our document fields.

Let's once again start from the bottom up, by creating a function that will use `assetMap`
and `documentMap` to resolve the passed URL to an ID-based  Prismic asset or document
reference:

```javascript
// Because we will be using this function mutliple time per document and passing it
// around, we close over the common data, so the returned function "remembers" them and
// does not need passing them as parameters again
> makeReferenceResolver = ({ assetMap, documentMap, baseUrl }) =>
    // Given the reference URL we will return a matching document or asset, if any
    referenceUrl => {
      if (!referenceUrl) return;

      // As discused in the asset discovery step, this allows us to properly resolve
      // the image and link URLs relative to the document we're processing 
      const url = new URL(referenceUrl, baseUrl).toString();

      // If the URL was in the asset map, it was an asset link
      if (assetMap.has(url)) {
        return { id: assetMap.get(url).id, link_type: "Media" };
      }

      // If the URL was in the document map, it was a document link
      if (documentMap.has(url)) {
        return { id: documentMap.get(url).id, link_type: "Document" };
      }
    }
[Function: makeReferenceResolver]
```

We can now apply this function to a document, to see how it works in practice:

```javascript
// Pick a document to test with
> document = (await processingState).documents[1];
{
  path: URL { ...},
  type: "story",
  title: "La Geste de Foo Bar – Dusk",
  uid: "story-dusk",
  lang: "fr-fr",
  data: {
    chapterTitle: [ ... ],
    chapterIllustration: URL { ... },
    previousChapter: URL { ... },
    nextChapter: undefined,
    contents: [ ... ]
  },
  id: "ZhzVZhAAAO8K0PiF"
}

// Create the resolver
> resolveReference = makeReferenceResolver(
    { ...(await processingState), basePath: document.path }
  );
[Function (anonymous)]

// And resolve some references: your IDs may of course vary
> resolveReference(document.data.chapterIllustration)
{ id: "ZhxIBLOmp5Xm236M", link_type: "Media" }

> resolveReference(document.data.previousChapter)
{ id: "ZhxIABAAAJgKzoqK", link_type: "Document" }
```

Of course this function handles only a single field value, so we need to create a way to
apply it to all the fields of the document. Let's first create a helper function that will
take a resolver and a field name and return a function that updates a single field in
the document:

```javascript
// Close over the resolver, because we will be generating multiple field resolvers
// for a single document
> resolveFieldWith = resolver => 
    // Generate a field resolver for the given field name
    fieldName =>
      data => {
        // Try to resolve the field value to it's Prismic ID, if any
        const result = resolver(data[fieldName]);

        // If the fields value has a corresponding Prismic asset/document, update
        // the field with the metadata provided by the resolver
        return result
          ? { ...data, [fieldName]: result }
          : data;
      }
[Function: resolveFieldWith]
```

And here's how it works for one of our documents:

```javascript
// We use the `resolveReference` from the previous REPL session to create
// a field reference resolver factory
> resolveLinkField = resolveFieldWith(resolveReference)
[Function (anonymous)]

// Then we create reference resolvers for particular fields
> resolveChapterIllustration = resolveLinkField("chapterIllustration")
[Function (anonymous)]

> resolvePreviousChapter = resolveLinkField("previousChapter")
[Function (anonymous)]

> resolveNextChapter = resolveLinkField("nextChapter")
[Function (anonymous)]

// We now test it using the same `document` from the above session
> resolveChapterIllustration(document.data).chapterIllustration
{ id: "ZhxIBLOmp5Xm236M", link_type: "Media" }

> resolvePreviousChapter(document.data).previousChapter
{ id: "ZhxIABAAAJgKzoqK", link_type: "Document" }

> resolveNextChapter(document.data).nextChapter
undefined
```

As you can see, we can now easily create functions updating a single field in document – but
it would be handy to compose them together to handle all the fields of the document. One
interesting option is to uses promises.

While promises are usually used for processing data asynchronously (for example with data
over the network), it's not the only way they can be used. You can create an already resolved
promise over a piece of sync data using `Promise.resolve` and then call the `then` method to
chain data transformation on the subject of the promise.

This method is also flexible, because you can easily slot in an actual asynchronous
transformation (for example one that needs to read a file or call an external service to
properly resolve the reference) between sync ones easily without changing anything.

Let's see how this could look for a single document:

```javascript
> resolveStoryReferences = (({ document, resolveLinkField }) =>
    Promise.resolve(document.data)
      // We apply each field resolver to the data
      .then(resolveLinkField("chapterIllustration"))
      .then(resolveLinkField("previousChapter"))
      .then(resolveLinkField("nextChapter"))
      // And then update the document with resolved data
      .then(data => ({ ...document, data })))
[Function: resolveStoryReferences]

// And now let's apply it to a document to see if it works
> (await resolveStoryReferences({ document, resolveLinkField  })).data
{
  chapterTitle: [ ... ],
  chapterIllustration: { id: "ZhzcxbOmp5Xm236X", link_type: "Media" },
  previousChapter: { id: "ZhzVZxAAAOMK0PiJ", link_type: "Document" },
  nextChapter: undefined,
  contents: [ ... ]
}
```

As you can see we can use this method to compose multiple tranformations on a document
fields, building the resolver for a whole document from smaller pieces. What is left now,
is to apply this single-document resolver to all the documents in the processing state:

```javascript
> resolveReferences = referenceMapper => processingState => {
    // To resolve the references we will map over the documents using the `referenceMapper`
    const resolveDocumentReferences = mapDocuments(document => {
      // Mapping references requires providing resolvers to `referenceMapper`,
      // So we create them here
      const resolver = makeReferenceResolver({ 
        ...processingState, baseUrl: document.path
      });
      const resolveLinkField = resolveFieldWith(resolver);
      
      // And pass them alognside the document to the `referenceMapper`
      return referenceMapper({ document, resolveLinkField })
    });

    // And then we just apply the document mapper to current processing state
    return resolveDocumentReferences(processingState);
  }
[Function: resolveReferences]
```

And now we can resolve those fields in all documents by applying the resolver produced by
`resolveReferences(resolveReferencesForStory)` to the processing state:

```javascript
> await (
    processingState
      .then(resolveReferences(resolveStoryReferences))
      .then(({ documents }) => documents.map(({ data }) => data))
  )
[
  {
    chapterTitle: [ ... ],
    chapterIllustration: { id: "ZhzcxLOmp5Xm236V", link_type: "Media" },
    previousChapter: undefined,
    nextChapter: { id: "ZhzVZxAAAOMK0PiN", link_type: "Document" },
    contents: [ ... ]
  },
  {
    chapterTitle: [ ... ],
    chapterIllustration: { id: "ZhxIBLOmp5Xm236M", link_type: "Media" },
    previousChapter: { id: "ZhxIABAAAJgKzoqK", link_type: "Document" },
    contents: [
      ...
      {
        type: "image",
        alt: null,
        url: "../assets/images/magic-battle.png"
      },
      ...
    ]
  },

  ...
]
```

As you can see fields like `chapterIllustration` or `nextChapter` now have properly resolved
references, but it seems we have forgotten about the rich text field! Since we already have
`mapRichText` that helps us apply functions to each span and element easily, to add support
for resolving references in a rich text field we only need to write resolvers that will work
with those values.

Those functions should be very similar to each other and hopefully straightforward:

  * first check if it's an element/span that is of interest to use (image or link) – otherwise
    return the element/span unchanged,
  * then check if the URL contained in this element/span resolves to an existing asset/document
    and if so, update the element/span with the resolved value,
  * otherwise, return the element/span unchanged.

Let's see how that looks in practice:

```javascript
// Generates a function that resolves references in a Prismic rich text element
> makeElementResolver = resolveReference => element => {
    switch (element.type) {
      // We only care about images
      case "image": {
        // We separate `url` from other element properties,
        // to remove it from the resolved element
        const { url, ...restElement } = element;
        const { id }                  = resolveReference(url) ?? {};
      
        return id
          ? { ...restElement, id }
          : element;
      }
      // If it's not an image, return the element as-is
      default:
        return element;
    }
  }
[Function: makeElementResolver]
```

The `makeSpanResolver` function for spans is very similar – just focusing on links:

```javascript
> makeSpanResolver = resolveReference => span => {
    switch (span.type) {
      // We only care about links
      case "hyperlink": {
        // We separate `url` from other span properties,
        // to remove it from the resolved span
        const { url, ...restData } = span.data;
        const { id, link_type }    = resolveReference(url) ?? {};

        return id
          ? { ...span, data: { ...restData, id, link_type } }
          : span;
      }
      // If it's not a link, return the span as-is
      default:
        return span;
    }
  }
[Function: makeSpanResolver]
```

Now the only thing left is to apply those functions to the rich text. Let's create a rich
text resolver helper, by passing those mapping functions as arguments to `mapRichText`:

```javascript
> resolveRichTextReferences = referenceResolver =>
    mapRichText({
      element: makeElementResolver(referenceResolver),
      span:    makeSpanResolver(referenceResolver),
    })
[Function: resolveRichTextReferences]
```

We can now update our resolution functions to work with the rich text field resolver:

```javascript
> resolveReferences = referenceMapper => processingState => {
    const resolveDocumentReferences = mapDocuments(document => {
      const resolver = makeReferenceResolver({
         ...processingState, baseUrl: document.path
      });

      return referenceMapper({
        document,
        // We will now pass resolves as an object, to make it more convenient
        // to refer to multiple resolvers
        resolvers: {
          linkField:      resolveFieldWith(resolver),
          richTextField:  resolveFieldWith(resolveRichTextReferences(resolver)),
        }
      })
    });

    return resolveDocumentReferences(processingState);
  }
[Function: resolveReferences]

> resolveStoryReferences = ({ document, resolvers }) => {
    return Promise.resolve(document.data)
      .then(resolvers.linkField("chapterIllustration"))
      .then(resolvers.linkField("previousChapter"))
      .then(resolvers.linkField("nextChapter"))
      .then(resolvers.richTextField("contents"))
      .then(data => ({ ...document, data }));
  }
[Function: resolveStoryReferences]
```
And now we can see that it also properly resolves references in rich text fields.

```javascript
> (await processingState.then(resolveReferences(resolveStoryReferences))).documents[1].data
{
  chapterTitle: [ ... ],
  chapterIllustration: { id: "ZhxIBLOmp5Xm236M", link_type: "Media" },
  previousChapter: { id: "ZhxIABAAAJgKzoqK", link_type: "Document" },
  contents: [
    {
      type: "paragraph",
      text: "Lorem ipsum dolor sit amet ...",
      spans: [
        {
          type: "hyperlink",
          start: 454,
          end: 460,
          data: { link_type: "Document", id: "ZhxIABAAAJkKzoqD" }
        },
        {
          type: "hyperlink",
          start: 672,
          end: 678,
          data: { link_type: "Document", id: "ZhxIABAAAJkKzoqD" }
        }
      ]
    },
    ...
    {
      type: "image",
      alt: null,
      url: id: "ZhxIBrOmp5Xm236O"
    },
    ...
  ]
}
```

The only thing left now is to update the processing state with this information and sync
the documents with the Migration API again and we're done:

```javascript
> processingState = processingState.then(resolveReferences(resolveStoryReferences))
Promise { ... }

> processingState = processingState.then(syncWithMigrationRelease())
Promise { ... }

> await processingState
{
  documents: [
    ...
  ],
  documentMap: Map(10) {
    ...
  },
  assetMap: Map(9) {
    ...
  }
}
```

You should now be able to navigate to your migration release and see the documents imported
with properly resolved assets and document references in it's fields.

This concludes the walkthrough of the script.

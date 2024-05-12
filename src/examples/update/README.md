# Updating existing documents programmatically

Sometimes you might need to update your documents in bulk – for example if you decided
to change a translation of a common term in your documents or replace a widely-used
asset with a different one. Since doing that by hand is tedious and error-prone, you
might want to decide to automate this instead. This example will show you how you can
build on the understanding from the HTML import example to accomplish that.

## Prerequisites

### Prismic repository setup

The example assumes you have set up the repository for the HTML import example, but it
is easily adaptable to any repository, as it doesn't assume much about available custom
types or documents – you will only have to adjust the function that modifies the
document to match your custom type structure.

## High-level overview

The example script is rather simple – it first loads the documents, then modifies their
contents and finally syncs them back to the migration release. An alternative version that
works better for repositories with many documents by processing them in batches is provided
in a comment.

The bulk update script is located at `src/examples/update/index.mjs` and you can run it with
`yarn examples:update` or `npm run examples:update` if you want to test how it works.

## Loading documents

Because the Migration API doesn't support partial updates at the time of writing, we have
to fetch the existing documents first. To do that, we will use the [`@prismic/client`](
https://www.npmjs.com/package/@prismicio/client) package that provides an easy way to
communicate with the repository. You can use the already pre-configured client from
`src/import/utils.mjs`:

```javascript
> var { documentApiClient } = await import("./src/import/utils.mjs")
undefined
```

For simplicity, we will use the `dangerouslyGetAll` method to load all the documents for
now. Later on we will show how you can adapt the code to repositories containing thousands
of documents.

```javascript
loadAll = async () => {
  const documents = await documentApiClient.dangerouslyGetAll();

  return { documents };
}
[AsyncFunction: loadAll]

> processingState = loadAll()
Promise { ... }

> await processingState
{
  documents: [
    ...
  ],
}
```

Because both the Document and Migration APIs use the Prismic API V2 format, there is no
need to adapt the Document API response – we only nest the results under a `documents`
field, as this is the expectation of the import helpers we wrote in the HTML example.

## Processing documents

Thanks to the helpers available in the examples, processing documents should be easy:

```javascript
> var { mapDocuments } = await import("./src/import/documents.mjs")
undefined

// We add a paragraph with the current timestamps to demonstrate updating a document
> addTimestampParagraph = async document => ({
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
  })
[AsyncFunction: addTimestampParagraph]

> documentMapper = mapDocuments(addTimestampParagraph)
[AsyncFunction (anonymous)]

> processingState = processingState.then(documentMapper)
Promise { ... }

> await processingState
{
  documents: [
    ...
  ],
}
```

If you need some more complex transform, you can always use the `mapRichText` helper, as
described in the HTML import example. Of course, sometimes you might want to do updates
that are not easy to automate – in that case you could split the script in two parts:
the first fetching the documents from the repo and saving them locally, the other reading
the saved documents and syncing them back to the migration release.

You can use the `dumpState`/`loadState` helpers from `src/import/utils.mjs` to do that. If
you'd prefer to save each document to a separate file, feel free to adapt functions
accordingly. You can see a simple example of that at the end of this document.

## Updating the documents

We can now sync the documents with the migration release:

```javascript
> var { syncWithMigrationRelease } = await import("./src/import/documents.mjs")
undefined

> processingState = processingState.then(syncWithMigrationRelease())
Promise { ... }

> await processingState
{
  documents: [
    ...
  ],
}
```

At this point, you can open the Prismic UI , navigate to the migration release screen and
review or publish your documents.

## Handling big repositories

If you have a repository with many documents, it might make more sense to process documents
in batches, as it will limit memory usage.

A good mechanism for this use-case are _generators_. They are a programming construct that
allows a function to return multiple times. They are useful when you want to  generate
values on-demand, instead of having to store them in memory all at the same time – which is
exactly our use-case.

We will use an _`async` generator_ variant to interoperate with `async` functions used
to fetch data:

```javascript
// Generators require you to use the `function` syntax
> getInBatches = async function* (parameters = {}) {
    // We start with the first page (or a page caller specified)
    let page = parameters.page || 1;
    let nextPage = true;

    // We will loop while there is a next page of document results
    // When the function will finish looping, the generator will complete as well
    while (nextPage) {
      // Override the page parameter to the one we are at, pass all other parameters
      // through, to support full functionality of the `get` method (e.g. filtering)
      const response = await documentApiClient.get({ ...parameters, page });

      // We use the `yield` keyword to return a single result from a generator
      // Because the `yield` is used in a loop, it means we will return multiple values
      yield ({
        documents:  response.results,
        page:       response.page,
        totalPages: response.total_pages,
      });

      // Check if this is the last results page
      nextPage = !!response.next_page;
      page += 1;
    }
  }
[AsyncGeneratorFunction: getInBatches]
```

As you can see, we pass all the parameters to the `get` call – this mean you're free to use
any supported features of the `get` method, such as using the `filter` parameter to filter
(see the [Prismic documentation](https://prismic.io/docs/technical-reference/prismicio-client#query-filters)
on how to use it):

We can use this kind of generator with a `for await ... of` loop – it will keep asking for
consecutive elements of the generator until it completes and process them asynchronously
using the provided loop body. This allows us to easily process the documents in batches, using
the `pageSize` parameter to control the batch size:

```javascript
> for await (const batch of getInBatches({ pageSize: 2 })) {
    console.log("Processing batch:", batch);
  }
Processing batch: { ... }
Processing batch: { ... }
Processing batch: { ... }
undefined
```

The `console.log` is a placeholder for whatever processing you might want to do. For example
we could wrap the processing we've done previously into a function and then call it for each
generator element in the loop body:

```javascript
> var { syncWithMigrationRelease } = await import("./src/import/documents.mjs")
undefined

> processDocuments = async documents =>
    documentMapper(documents).then(syncWithMigrationRelease())
[AsyncFunction: processDocuments]

> for await (const batch of getInBatches({ pageSize: 2 })) {
    await processDocuments(batch);
  }
undefined
```

Another option is, as mentioned previously, first saving documents to files, modifying
them by hand, and then updating. A very basic script to save the documents could look
like this (you have to create the `documents` directory beforehand):

```javascript
> var fs = await import("node:fs/promises")
undefined

> for await (const batch of getInBatches({ pageSize: 2 })) {
    for (const document of batch.documents) {
      await fs.writeFile(
        `documents/${ document.id }.json`,
        JSON.stringify(document, undefined, 2),
        { encoding: "utf-8" }
      );
    }
  }
undefined
```

At this point, you would modify the documents in files, then read them back and sync
with the migration release. A very basic script to do that could look like this:

```javascript
> var { glob } = await import("glob")
undefined

> var { pathToFileURL } = await import("node:url")
undefined

> for await (const documentPath of glob.iterate("documents/*.json")) {
    const path     = pathToFileURL(documentPath)
    const document = await fs.readFile(path, { encoding: "utf-8" })
                             .then(JSON.parse);

    // Necessary if you would want to use e.g. `resolveReferences` and `syncAssets`
    // to add new assets/links to your documents
    document.path = path;

    await Promise.resolve({ documents: [ document ]})
      .then(syncWithMigrationRelease())
  }
undefined
```

Of course this is code is very simplified and doesn't exhaustively support all the ways
you can modify the documents – for example if you added a new image using a `file://...`
URL, you will need to discover the assets, sync them with the Media Library and resolve
references to those assets in the documents. It should be relatively simple to do this
by referencing the HTML import example.

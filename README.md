# Migration API examples

## Prerequisites

This covers common prerequisites for all the examples. Specific examples might have
additional requirements – please refer to specific examples.

### Node.js

This tutorial is written in JavaScript using Node.js 20 LTS runtime and will use modern
JS features – if your runtime doesn't support them, adjust the code accordingly or update
it to a version supporting those features.

You can check if you have the required version installed by running `node --version` in
your shell. If you don't, you can use a tool like [`asdf`](https://asdf-vm.com) or
[`nvm`](https://github.com/nvm-sh/nvm#readme) to install it.

You can use either `yarn install` or `npm install` to install dependencies, lock files are
provided for both package managers.

### Credentials

To be able to interact with the Asset and Migration APIs you will need to prepare:

  * a Content API Token,
  * a Write API Token,
  * a Migration API Demo Key,
  * the name of the repository you will be using.

The tokens can be created on the Api & Security tab of your repository settings. The
Migration API key should be available on the migration release screen of your repository.

You can use the `.env.example` file as a template to create an `.env` file in the root
of the repository and put your credentials here – the example code uses [`dotenv`](
https://github.com/motdotla/dotenv#readme) as not to force you to specify those environment
variables on each command.

### NodeJS REPL

The code in the examples is presented as a NodeJS REPL session. The could you should enter is
indicated with `>` at the start and indented two spaces. The result of this expression is
presented directly underneath, unindented. This means that you can just run the `node` command
in your terminal and paste the indicated code (excluding the `>`, of course) to experiment
with it.

<p>
<details>
<summary>Example REPL session</summary>

```javascript
// In the REPL sessions we will use on variable keyword (or `var`, if syntactically necessary,
// as below) so we can easily modify the variables and functions as we go along.
> var { glob } = await import("glob")
undefined

// An expression that takes more than one line will be indented and the result
// will be shown directly underneath, unindented
> findDocuments = async documentGlob => {
    const paths     = await glob(documentGlob, { absolute: true });
    const documents = paths.map(path => ({ path }));

    return { documents };
  }
[AsyncFunction: findDocuments]

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
</details>
</p>

## Available examples

  * [import pages from HTML](./src/examples/html/README.md) – this example shows how you can
    import plain HTML pages into Prismic using the Migration API,
  * [update existing documents](./src/examples/update/README.md) – this example builds on the
    understanding from the previous example, to show how you can programmatically update
    existing documents.

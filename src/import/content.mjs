import { identity, isArray, isUndefined, isNull } from "lodash-es";

import { mapDocuments } from "./documents.mjs";


// Wraps a value into array (if it is not already one), and removes any `undefined`/`null` values
const asArray = value => 
  (isArray(value) ? value : [ value ]).filter(value => !(isUndefined(value) || isNull(value)))

// A helper to map Prismic rich text by traversing rich text elements, first applying the `span`
// function to map the element's spans and then applying the `element` function to the resulting
// element with processed spans.
//
// You can:
//   * return a modified element/span to update it
//   * return more than one value in an array, to insert a new one
//   * return `undefined`/`null` value to remove it 
export const mapRichText = ({ 
  element: onElement = identity,
  span:    onSpan    = identity
} = {}) =>
  content =>
    content.flatMap(element => {
      // Update the element with processed spans, but only if it already had them
      // as some elements do not have spans
      if (element.spans) {
        const spans = element.spans?.flatMap(span => asArray(onSpan(span)));

        element = { ...element, spans };
      }

      return asArray(onElement(element));
    })

// Reference resolution

// Generates a function that resolves URLs to Prismic assets and documents
export const makeReferenceResolver = ({ assetMap, documentMap, baseUrl }) =>
  referenceUrl => {
    if (!referenceUrl) return;

    const url = new URL(referenceUrl, baseUrl).toString();

    if (assetMap.has(url))    return { id: assetMap.get(url).id,    link_type: "Media" };
    if (documentMap.has(url)) return { id: documentMap.get(url).id, link_type: "Document" };
  };

// Generates a function that resolves references in a Prismic rich text element
const makeElementResolver = resolveReference => element => {
  switch (element.type) {
    // We only care about images
    case "image": {
      // We separate `url` from other element properties, to remove it from the resolved element
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
};

// Generates a function that resolves references in a Prismic rich text element span
const makeSpanResolver = resolveReference => span => {
  switch (span.type) {
    // We only care about links
    case "hyperlink": {
      // We separate `url` from other span properties, to remove it from the resolved span
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
};

// Generates a function that applies resolver to a single field of the document
export const resolveFieldWith = resolver => fieldName => data => {
  const result = resolver(data[fieldName]);

  return result
    ? { ...data, [fieldName]: result }
    : data;
}

// Generates a function that will apply given reference resolver to elements
// of the Prismic rich text that can contain references (images and links)
export const resolveRichTextReferences = referenceResolver =>
  mapRichText({
    element: makeElementResolver(referenceResolver),
    span:    makeSpanResolver(referenceResolver),
  });

// Generates a function that resolves references in the `processingState` by using
// the passed in `referenceMapper`
export const resolveReferences = referenceMapper => processingState => {
  const resolveDocumentReferences = mapDocuments(document => {
    const resolver = makeReferenceResolver({ ...processingState, baseUrl: document.path });

    return referenceMapper({
      document,
      resolvers: {
        linkField:      resolveFieldWith(resolver),
        richTextField:  resolveFieldWith(resolveRichTextReferences(resolver)),
      }
    })
  });

  return resolveDocumentReferences(processingState);
};

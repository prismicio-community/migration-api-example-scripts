import { documentApiClient } from "../../import/utils.mjs";


// Get all the documents stored in the repository
export const loadAll = async () => {
  const documents = await documentApiClient.dangerouslyGetAll();

  return { documents };
};

// Get documents using an async generator returning documents in batches of `pageSize` (defaults 
// to 100)
//
// All `documentClient.get` parameters are supported, so you can for example `filter` the results
// (see Prismic docs: https://prismic.io/docs/technical-reference/prismicio-client#query-filters)
export const getInBatches = async function* batchGenerator(parameters = {}) {
  // Start with the page specified in parameters, or the first page
  let page = parameters.page || 1;
  let nextPage = true;

  while (nextPage) { 
    const response = await documentApiClient.get({ ...parameters, page });

    // Return only relevant data; we use the `documents` property name for results – matching
    // the `processingState` shape allows use to easily interoperate with existing helpers
    yield {
      documents:  response.results,
      page:       response.page,
      totalPages: response.total_pages,
    };

    nextPage = !!response.next_page;
    page += 1;
  }
}

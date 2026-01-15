
const CIVITAI_API_BASE = 'https://civitai.com/api/v1';
const CIVITAI_TRPC_BASE = 'https://civitai.com/api/trpc';

export interface CivitaiImage {
  id: number;
  url: string;
  hash?: string;
  width: number;
  height: number;
  nsfw?: boolean;
  nsfwLevel?: string;
  createdAt: string;
  postId?: number;
  steps?: { images?: Array<{ url: string; available: boolean }> };
  meta: {
    prompt?: string;
    negativePrompt?: string;
    seed?: number;
    steps?: number;
    sampler?: string;
    cfgScale?: number;
    Model?: string;
    [key: string]: any;
  } | null;
  username?: string;
}

export interface GenerationFeedImage {
  id: string;
  createdAt: string;
  params: {
    prompt?: string;
    negativePrompt?: string;
    width: number;
    height: number;
    seed?: number;
    steps?: number;
    sampler?: string;
    cfgScale?: number;
  };
  steps?: Array<{
    images?: Array<{
      url: string;
      available: boolean;
      type?: string;
    }>;
  }>;
}

export interface CivitaiImagesResponse {
  items: CivitaiImage[];
  metadata: {
    nextCursor?: string | number;
    currentPage?: number;
    pageSize?: number;
    nextPage?: string;
  };
}

export interface GenerationFeedResponse {
  items: GenerationFeedImage[];
  nextCursor?: string;
}

export interface CivitaiUser {
  id: number;
  username: string;
  image?: string;
}

export async function getCivitaiUser(apiKey: string): Promise<CivitaiUser | null> {
  try {
    const response = await fetch(`${CIVITAI_API_BASE}/me`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to get Civitai user:', response.status, response.statusText);
      return null;
    }

    return await response.json() as CivitaiUser;
  } catch (error) {
    console.error('Error fetching Civitai user:', error);
    return null;
  }
}

export async function getGenerationFeed(
  apiKey: string,
  options: {
    cursor?: string;
    take?: number;
    sort?: 'Newest' | 'Oldest';
  } = {}
): Promise<GenerationFeedResponse> {
  // Use the correct endpoint from civitai-sync: orchestrator.queryGeneratedImages
  // Parameters: { authed: true, tags: ["gen"], cursor, sort: "Newest" or "Oldest" }
  const sortOrder = options.sort || 'Newest';
  const input: { json: { authed: boolean; tags: string[]; cursor?: string; sort?: string } } = {
    json: {
      authed: true,
      tags: ["gen"],
      sort: sortOrder,
    }
  };
  
  if (options.cursor) {
    input.json.cursor = options.cursor;
  }

  const url = `${CIVITAI_TRPC_BASE}/orchestrator.queryGeneratedImages?input=${encodeURIComponent(JSON.stringify(input))}`;
  console.log(`Fetching Civitai generation feed (sort: ${sortOrder})...`);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Referer': 'https://civitai.com/',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Generation feed error:', response.status, text);
    throw new Error(`Failed to fetch generation feed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.result?.data?.json) {
    console.log('Unexpected response structure:', JSON.stringify(data, null, 2));
    return { items: [], nextCursor: undefined };
  }

  const result = data.result.data.json;
  const items: GenerationFeedImage[] = result.items || [];
  
  // Sort by createdAt based on sort order (in case API doesn't fully support it)
  items.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return sortOrder === 'Newest' ? dateB - dateA : dateA - dateB;
  });
  
  return {
    items,
    nextCursor: result.nextCursor,
  };
}

export async function getUserImages(
  apiKey: string,
  username: string,
  options: {
    limit?: number;
    cursor?: number;
    sort?: 'Most Reactions' | 'Most Comments' | 'Newest';
    period?: 'AllTime' | 'Year' | 'Month' | 'Week' | 'Day';
    nsfw?: boolean | 'None' | 'Soft' | 'Mature' | 'X';
  } = {}
): Promise<CivitaiImagesResponse> {
  const params = new URLSearchParams();
  params.set('username', username);
  params.set('limit', String(options.limit || 100));
  
  if (options.cursor) {
    params.set('cursor', String(options.cursor));
  }
  if (options.sort) {
    params.set('sort', options.sort);
  }
  if (options.period) {
    params.set('period', options.period);
  }
  if (options.nsfw !== undefined) {
    params.set('nsfw', String(options.nsfw));
  }

  const url = `${CIVITAI_API_BASE}/images?${params.toString()}`;
  console.log('Fetching Civitai posted images:', url);

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch images: ${response.status} ${response.statusText}`);
  }

  return await response.json() as CivitaiImagesResponse;
}

export async function downloadImage(imageUrl: string): Promise<Buffer> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteGeneratedImages(
  apiKey: string,
  imageIds: string[]
): Promise<{ success: boolean; deleted: number; errors: string[] }> {
  const errors: string[] = [];
  let deleted = 0;

  // Delete each image from the generation feed
  for (const id of imageIds) {
    try {
      const input = {
        json: {
          ids: [id],
        }
      };

      const url = `${CIVITAI_TRPC_BASE}/orchestrator.deleteAllWorkflowSteps?input=${encodeURIComponent(JSON.stringify(input))}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Referer': 'https://civitai.com/',
        },
      });

      if (response.ok) {
        deleted++;
      } else {
        const text = await response.text();
        errors.push(`Failed to delete ${id}: ${response.status} ${text}`);
      }
    } catch (error: any) {
      errors.push(`Error deleting ${id}: ${error.message}`);
    }
  }

  return { success: errors.length === 0, deleted, errors };
}

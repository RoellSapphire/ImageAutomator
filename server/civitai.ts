
const CIVITAI_API_BASE = 'https://civitai.com/api/v1';

export interface CivitaiImage {
  id: number;
  url: string;
  hash: string;
  width: number;
  height: number;
  nsfw: boolean;
  nsfwLevel: string;
  createdAt: string;
  postId: number;
  stats: {
    cryCount: number;
    laughCount: number;
    likeCount: number;
    dislikeCount: number;
    heartCount: number;
    commentCount: number;
  };
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
  username: string;
}

export interface CivitaiImagesResponse {
  items: CivitaiImage[];
  metadata: {
    nextCursor?: number;
    currentPage?: number;
    pageSize?: number;
    nextPage?: string;
  };
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
  console.log('Fetching Civitai images:', url);

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

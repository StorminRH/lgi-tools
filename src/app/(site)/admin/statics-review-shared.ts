import { cache } from 'react';
import { getWhStaticsOperatorReview } from '@/composition/wh-statics-refresh';

export const getStaticsReviewShared = cache(getWhStaticsOperatorReview);

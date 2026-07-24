import { registerCharacterOwnerReconciler } from '@/platform/auth/owner-reconcile-hook';
import { reconcileCharacterOwner } from './owner-transfer';

registerCharacterOwnerReconciler(reconcileCharacterOwner);

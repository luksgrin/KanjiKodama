import { Placeholder } from '../../components/Placeholder';
import { useRoute } from '../../hooks/useRoute';

/** Stub: replaced by the item page (built from `ui/components/subject/`). Route `/subject/:id`. */
export function SubjectScreen() {
  const { params } = useRoute();
  return <Placeholder title={`Item ${params.id ?? ''}`} />;
}

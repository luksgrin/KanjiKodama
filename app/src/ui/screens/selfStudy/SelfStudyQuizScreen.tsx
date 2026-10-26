/** The running self-study quiz (also the level test rounds): `SessionActivity` for SELF_STUDY sessions. */
import { SessionScreen } from '../../components/session/SessionScreen';

export function SelfStudyQuizScreen() {
  return <SessionScreen kind="SELF_STUDY" emptyText="No self-study session is running." />;
}

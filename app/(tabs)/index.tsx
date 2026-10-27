import { Redirect } from 'expo-router';

/** The default entry opens Today; other deep links keep their own routes. */
export default function Index() {
  return <Redirect href="/today" />;
}

import { redirectForCurrentUser } from "@/lib/operational/server-auth";
export default async function Home(){await redirectForCurrentUser();return null;}

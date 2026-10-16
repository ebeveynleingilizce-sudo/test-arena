export const season2WelcomeRule = `
    // A pupil may acknowledge this announcement once; no other profile field changes.
    match /teachers/{t}/students/{s} {
      allow update: if pupil(t,s)
        && resource.data.get('season2WelcomeSeen',false) == false
        && request.resource.data.season2WelcomeSeen == true
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['season2WelcomeSeen']);
    }
`;
export function addSeason2WelcomeRule(source) {
  if (source.includes("affectedKeys().hasOnly(['season2WelcomeSeen'])")) return source;
  const normalized = source.replace(/\r\n/g,'\n');
  if (!/\n  }\n}\s*$/.test(normalized)) throw Error('Unexpected Firestore rules boundary');
  return normalized.replace(/\n  }\n}\s*$/, season2WelcomeRule + '\n  }\n}\n');
}

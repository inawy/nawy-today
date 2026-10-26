import { configure } from '@testing-library/react';

// The default wait for `findBy…` / `waitFor` is 1 s. On a loaded CI runner, a save that goes
// through fake IndexedDB and a live query can take longer, and a test then fails without any
// fault in the code (seen on `EventFlow`, D-055). Waiting longer only costs time when something
// is really wrong: a passing wait still returns at once.
configure({ asyncUtilTimeout: 5000 });

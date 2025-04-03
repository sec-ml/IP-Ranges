// Flag for detecting Node.js vs browser context
const isNode = typeof window === 'undefined';

// Run only if in browser
if (!isNode) {
  // Maximum number of individual IPs to render before switching to range mode
  const MAX_RENDERABLE_IPS = 50000;

  window.addEventListener('DOMContentLoaded', () => {
    inputA.value = '';
    inputB.value = '';
  });

  const inputA = document.getElementById('inputA');
  const inputB = document.getElementById('inputB');
  const results = document.getElementById('results');

  let displayMode = 'list';
  let filterMode = 'in-both';
  let debounceTimer;

  inputA.addEventListener('input', handleInputChange);
  inputB.addEventListener('input', handleInputChange);

  function handleInputChange() {
    if (debounceTimer) clearTimeout(debounceTimer);

    const combined = inputA.value + '\n' + inputB.value;
    const lastChar = combined.trimEnd().slice(-1);

    if (lastChar === '\n' || lastChar === ' ') {
      compareLists();
    } else {
      debounceTimer = setTimeout(compareLists, 500);
    }
  }

  document.getElementById('btnList').addEventListener('click', () => {
    if (document.getElementById('btnList').disabled) return;
    displayMode = 'list';
    updateModeButtons();
    compareLists();
  });

  document.getElementById('btnRanges').addEventListener('click', () => {
    displayMode = 'ranges';
    updateModeButtons();
    compareLists();
  });

  document.getElementById('btnOnlyA').addEventListener('click', () => {
    filterMode = 'only-a';
    updateFilterButtons();
    compareLists();
  });

  document.getElementById('btnInBoth').addEventListener('click', () => {
    filterMode = 'in-both';
    updateFilterButtons();
    compareLists();
  });

  document.getElementById('btnOnlyB').addEventListener('click', () => {
    filterMode = 'only-b';
    updateFilterButtons();
    compareLists();
  });

  function updateModeButtons() {
    document.getElementById('btnList').classList.toggle('selected', displayMode === 'list');
    document.getElementById('btnRanges').classList.toggle('selected', displayMode === 'ranges');
  }

  function updateFilterButtons() {
    document.getElementById('btnOnlyA').classList.toggle('selected', filterMode === 'only-a');
    document.getElementById('btnInBoth').classList.toggle('selected', filterMode === 'in-both');
    document.getElementById('btnOnlyB').classList.toggle('selected', filterMode === 'only-b');
  }

  function setListButtonEnabled(enabled) {
    const btn = document.getElementById('btnList');
    btn.disabled = !enabled;
    btn.classList.toggle('disabled', !enabled);
    btn.title = enabled ? '' : 'Too many IPs to render as list';
  }

  function isValidIP(ip) {
    const regex = /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.){3}(25[0-5]|(2[0-4]|1\d|[1-9]|)\d)$/;
    return regex.test(ip);
  }

  function ipToInt(ip) {
    const [a, b, c, d] = ip.split('.').map(Number);
    return a * 256 ** 3 + b * 256 ** 2 + c * 256 + d;
  }

  function intToIp(int) {
    return [
      (int >> 24) & 255,
      (int >> 16) & 255,
      (int >> 8) & 255,
      int & 255
    ].join('.');
  }

  function expandIPLine(token) {
    if (token.includes('/')) {
      const [ip, bits] = token.split('/');
      if (!isValidIP(ip)) return [];
      const maskBits = parseInt(bits, 10);
      if (isNaN(maskBits) || maskBits < 0 || maskBits > 32) return [];
      const ipInt = ipToInt(ip);
      const subnetMask = (0xFFFFFFFF << (32 - maskBits)) >>> 0;
      const network = ipInt & subnetMask;
      const broadcast = network | (~subnetMask >>> 0);
      const result = [];
      for (let i = network; i <= broadcast; i++) {
        result.push(intToIp(i));
      }
      return result;
    }

    const rangeRegex = /^(.+?)\s*-\s*(.+)$/;
    const match = token.match(rangeRegex);
    if (match) {
      const start = match[1].trim();
      const end = match[2].trim();
      if (isValidIP(start) && isValidIP(end)) {
        const startInt = ipToInt(start);
        const endInt = ipToInt(end);
        if (startInt > endInt) return [];
        const result = [];
        for (let i = startInt; i <= endInt; i++) {
          result.push(intToIp(i));
        }
        return result;
      }
      if (isValidIP(start) && /^\d{1,3}$/.test(end)) {
        const endOctet = parseInt(end, 10);
        if (endOctet < 0 || endOctet > 255) return [];
        const startInt = ipToInt(start);
        const startOctet = startInt & 255;
        if (endOctet < startOctet) return [];
        const base = startInt & 0xFFFFFF00;
        const result = [];
        for (let i = startOctet; i <= endOctet; i++) {
          result.push(intToIp(base + i));
        }
        return result;
      }
      return [];
    }

    return isValidIP(token) ? [token] : [];
  }

  function tokenizeLine(line) {
    const tokens = [];
    const pattern = new RegExp(
      [
        '(?:\\d{1,3}\\.){3}\\d{1,3}/\\d{1,2}',
        '(?:\\d{1,3}\\.){3}\\d{1,3}\\s*-\\s*(?:\\d{1,3}\\.){3}\\d{1,3}',
        '(?:\\d{1,3}\\.){3}\\d{1,3}\\s*-\\s*\\d{1,3}',
        '(?:\\d{1,3}\\.){3}\\d{1,3}'
      ].join('|'),
      'g'
    );
    let match;
    while ((match = pattern.exec(line)) !== null) {
      tokens.push(match[0].trim());
    }
    return tokens;
  }

  function groupIntoRanges(ips) {
    const ranges = [];
    const nums = ips.map(ipToInt).sort((a, b) => a - b);
    let start = nums[0];
    let end = start;
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] === end + 1) {
        end = nums[i];
      } else {
        ranges.push(formatRange(start, end));
        start = end = nums[i];
      }
    }
    if (start !== undefined) {
      ranges.push(formatRange(start, end));
    }
    return ranges;
  }

  function formatRange(start, end) {
    return start === end ? intToIp(start) : `${intToIp(start)} - ${intToIp(end)}`;
  }

  function compareLists() {
    const listA = inputA.value
      .split('\n')
      .flatMap(line => tokenizeLine(line.replace(/,/g, ' ').trim()))
      .flatMap(token => expandIPLine(token));

    const listB = inputB.value
      .split('\n')
      .flatMap(line => tokenizeLine(line.replace(/,/g, ' ').trim()))
      .flatMap(token => expandIPLine(token));

    const setA = new Set(listA);
    const setB = new Set(listB);

    const rawInBoth = listA.filter(ip => setB.has(ip));
    const rawOnlyA = listA.filter(ip => !setB.has(ip));
    const rawOnlyB = listB.filter(ip => !setA.has(ip));

    const process = (list) => {
      const seen = new Set();
      return list
        .map(ip => ({ ip, int: ipToInt(ip) }))
        .sort((a, b) => a.int - b.int)
        .filter(item => {
          if (seen.has(item.ip)) return false;
          seen.add(item.ip);
          return true;
        })
        .map(item => item.ip);
    };

    const inBoth = process(rawInBoth);
    const onlyA = process(rawOnlyA);
    const onlyB = process(rawOnlyB);

    document.getElementById('btnOnlyA').textContent = `Only in A (${onlyA.length})`;
    document.getElementById('btnInBoth').textContent = `In A and B (${inBoth.length})`;
    document.getElementById('btnOnlyB').textContent = `Only in B (${onlyB.length})`;

    const selectedList = filterMode === 'only-a' ? onlyA
                        : filterMode === 'only-b' ? onlyB
                        : inBoth;

    const isTooLarge = selectedList.length > MAX_RENDERABLE_IPS;
    if (isTooLarge) {
      displayMode = 'ranges';
      setListButtonEnabled(false);
    } else {
      setListButtonEnabled(true);
    }

    updateModeButtons();

    const output = displayMode === 'ranges'
      ? groupIntoRanges(selectedList).sort((a, b) => {
          const startA = a.split('-')[0].trim();
          const startB = b.split('-')[0].trim();
          return ipToInt(startA) - ipToInt(startB);
        })
      : selectedList;

    results.textContent = output.join('\n');
  }
}
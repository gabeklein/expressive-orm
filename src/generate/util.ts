export function idealCase(
  from: string, lowercase?: boolean) {

  const items = from
    .split(/[_-]/g)
    .map(segment => {
      if(!segment.match(/[a-z]/) || !segment.match(/[A-Z]/)){
        const head = segment[0];
        const tail = segment.slice(1);

        if(head)
          return (head.toUpperCase() + tail.toLowerCase());
      }

      return segment;
    });

  const joined = items.join("");

  return lowercase
    ? joined[0].toLowerCase() + joined.slice(1)
    : joined;
}
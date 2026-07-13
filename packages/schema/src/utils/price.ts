export const sumFromObjects = <TArray extends object>(
  objects: TArray[],
  extractFromObject: (object: TArray) => number
) => objects.reduce((sum, object) => sum + extractFromObject(object), 0);

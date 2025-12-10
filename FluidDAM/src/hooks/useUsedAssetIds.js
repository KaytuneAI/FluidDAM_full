import { useState, useEffect } from 'react';
import { useEditor } from "@tldraw/editor";

// Hook: compute which assets are currently used on canvas (by image shapes)
export function useUsedAssetIds() {
  const editor = useEditor();
  const [ids, setIds] = useState(new Set());
  
  useEffect(() => {
    const recompute = () => {
      const imgs = editor.getCurrentPageShapes().filter(s => s.type === "image");
      const setA = new Set(imgs.map(s => s?.props?.assetId).filter(Boolean));
      setIds(setA);
    };
    
    recompute();
    const off = editor.store.listen((_rec, _prev) => { 
      recompute(); 
    }, { scope: "document" });
    
    return () => off();
  }, [editor]);
  
  return ids;
}

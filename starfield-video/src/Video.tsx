import React from "react";
import { Timegroup } from "@editframe/react";
import { CompositionCanvas } from "@editframe/react/r3f";
import { StarfieldScene, DURATION_MS } from "./StarfieldScene";

export const Video = () => {
  return (
    <Timegroup
      workbench
      mode="fixed"
      duration={`${DURATION_MS}ms`}
      fps={30}
      className="w-[1920px] h-[1080px] bg-[#05050a] relative overflow-hidden"
    >
      <CompositionCanvas
        containerClassName="absolute inset-0"
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#05050a"]} />
        <fog attach="fog" args={["#05050a", 25, 110]} />
        <StarfieldScene />
      </CompositionCanvas>
    </Timegroup>
  );
};

---- MODULE MC_BRIDGE_INVARIANTS ----
EXTENDS Naturals, Sequences, FiniteSets

MC_Msgs == {"m1", "m2", "m3"}
MC_Nonces == {"n1", "n2", "n3"}
MC_Channels == {"status", "telegram", "discord", "slack", "email"}

MC_SourceChannel ==
  "m1" :> "status" @@
  "m2" :> "status" @@
  "m3" :> "telegram"

MC_MsgNonce ==
  "m1" :> "n1" @@
  "m2" :> "n2" @@
  "m3" :> "n3"

MC_PolicyTargets ==
  "status"   :> {"telegram", "discord", "email"} @@
  "telegram" :> {"status", "email"} @@
  "discord"  :> {"status", "slack"} @@
  "slack"    :> {"status", "email"} @@
  "email"    :> {"status"}

INSTANCE BRIDGE_INVARIANTS WITH
  Msgs          <- MC_Msgs,
  Nonces        <- MC_Nonces,
  Channels      <- MC_Channels,
  SourceChannel <- MC_SourceChannel,
  MsgNonce      <- MC_MsgNonce,
  PolicyTargets <- MC_PolicyTargets

====

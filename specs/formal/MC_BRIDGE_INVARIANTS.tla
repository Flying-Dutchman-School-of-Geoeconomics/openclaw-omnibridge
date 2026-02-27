---- MODULE MC_BRIDGE_INVARIANTS ----
EXTENDS Naturals, Sequences, FiniteSets, TLC

\* State variables - must be declared here for substitution
VARIABLES pending, verified, processed, usedNonces, forwarded

\* Concrete constant definitions using TLA+ operator syntax
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

\* Instantiate BRIDGE_INVARIANTS with concrete values and explicit variable mapping
BI == INSTANCE BRIDGE_INVARIANTS WITH
  Msgs          <- MC_Msgs,
  Nonces        <- MC_Nonces,
  Channels      <- MC_Channels,
  SourceChannel <- MC_SourceChannel,
  MsgNonce      <- MC_MsgNonce,
  PolicyTargets <- MC_PolicyTargets,
  pending       <- pending,
  verified      <- verified,
  processed     <- processed,
  usedNonces    <- usedNonces,
  forwarded     <- forwarded

\* Re-export Spec and invariants so TLC can find them by name
Spec               == BI!Spec
AuthBeforeIngest   == BI!AuthBeforeIngest
NoReplayAccept     == BI!NoReplayAccept
ForwardPolicyBounded == BI!ForwardPolicyBounded

=============================================================================

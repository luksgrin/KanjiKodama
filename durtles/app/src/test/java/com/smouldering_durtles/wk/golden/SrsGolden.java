package com.smouldering_durtles.wk.golden;

import static com.smouldering_durtles.wk.golden.GoldenWriter.obj;
import static org.junit.Assert.assertEquals;

import com.smouldering_durtles.wk.livedata.LiveSrsSystems;
import com.smouldering_durtles.wk.model.SrsSystem;

import org.junit.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * SRS systems and {@link SrsSystem.Stage#getNewStage(int)}: every system x every stage (including
 * Locked -999, Initiate and Burned) x 0..8 incorrect answers.
 *
 * <p>The systems are the app's built-in fallback ({@link LiveSrsSystems#getDefaultValue()}). Their
 * stages and positions are identical to the srs_system rows of the bundled wk-content.db
 * (ids 1 and 2, unlocking 0, starting 1, passing 5, burning 9, same intervals); only the names
 * differ, and getNewStage does not use names.</p>
 */
public final class SrsGolden {
    private static Map<String, Object> stageInfo(final SrsSystem.Stage s) {
        return obj("id", s.getId(), "interval", s.getInterval(), "name", s.getName(), "shortName", s.getShortName(),
                "nameLetter", s.getNameLetter(), "advancedSearchTag", s.getAdvancedSearchTag(),
                "locked", s.isLocked(), "initial", s.isInitial(), "passed", s.isPassed(), "completed", s.isCompleted());
    }

    @Test
    public void systems() throws Exception {
        final List<SrsSystem> systems = LiveSrsSystems.getInstance().getDefaultValue();
        assertEquals(2, systems.size());
        try (final GoldenWriter w = GoldenWriter.open("srs/systems.json", "srs.systems",
                "livedata/LiveSrsSystems (fallback), model/SrsSystem.finish")) {
            for (final SrsSystem sys: systems) {
                final List<Object> stages = new ArrayList<>();
                for (final SrsSystem.Stage s: sys.getStages()) {
                    stages.add(stageInfo(s));
                }
                w.add("system-" + sys.getId(), obj("systemId", sys.getId()),
                        obj("id", sys.getId(), "name", sys.getName(),
                                "initialStage", sys.getInitialStage().getId(),
                                "firstStartedStage", sys.getFirstStartedStage().getId(),
                                "completedStage", sys.getCompletedStage().getId(),
                                "numPrePassedStages", sys.getNumPrePassedStages(),
                                "numPassedStages", sys.getNumPassedStages(),
                                "stages", stages));
            }
        }
    }

    @Test
    public void newStage() throws Exception {
        final List<SrsSystem> systems = LiveSrsSystems.getInstance().getDefaultValue();
        try (final GoldenWriter w = GoldenWriter.open("srs/new-stage.json", "srs.newStage",
                "model/SrsSystem.Stage.getNewStage")) {
            for (final SrsSystem sys: systems) {
                for (final SrsSystem.Stage s: sys.getStages()) {
                    for (int incorrect = 0; incorrect <= 8; incorrect++) {
                        final SrsSystem.Stage n = s.getNewStage(incorrect);
                        w.add("system" + sys.getId() + "-stage" + s.getId() + "-incorrect" + incorrect,
                                obj("systemId", sys.getId(), "stage", s.getId(), "numIncorrect", incorrect),
                                obj("stage", n.getId(), "interval", n.getInterval(), "name", n.getName(),
                                        "passed", n.isPassed(), "completed", n.isCompleted()));
                    }
                }
            }
            assertEquals(2 * 11 * 9, w.size());
        }
    }
}
